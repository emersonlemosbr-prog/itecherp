import { Adb, AdbDaemonTransport } from '@yume-chan/adb'
import { AdbDaemonWebUsbDeviceManager, AdbDaemonWebUsbDevice } from '@yume-chan/adb-daemon-webusb'
import AdbWebCredentialStore from '@yume-chan/adb-credential-web'

// One browser-local identity and one USB session for the application.
const credentials = new AdbWebCredentialStore('iTech ERP')
const manager = AdbDaemonWebUsbDeviceManager.BROWSER
const listeners = new Set()
let state = { status: 'idle', device: null, error: null }
let selected = null
let adb = null
let connection = null
let connecting = null
let generation = 0

function publish(patch) {
  state = { ...state, ...patch }
  for (const listener of listeners) listener(state)
}
function log(label, detail) {
  if (detail) console.info(label, detail)
  else console.info(label)
}
function errorMessage(error) {
  if (error instanceof AdbDaemonWebUsbDevice.DeviceBusyError) return 'Interface USB ocupada. Feche adb.exe ou outro programa que esteja usando ADB.'
  return error?.message || 'Não foi possível conectar ao Android.'
}
async function closeCurrent() {
  const activeAdb = adb
  const activeConnection = connection
  adb = null
  connection = null
  selected = null
  if (activeAdb) await activeAdb.close().catch(error => console.error('[ADB] close failed', error))
  else if (activeConnection?.device?.raw?.opened) await activeConnection.device.raw.close().catch(error => console.error('[WebUSB] close failed', error))
}
async function establish(device) {
  const ticket = ++generation
  await closeCurrent()
  selected = device
  publish({ status: 'opening_usb', error: null })
  try {
    log('[WebUSB] opening transport')
    connection = await device.connect()
    if (ticket !== generation) throw new Error('Conexão cancelada.')
    publish({ status: 'authenticating' })
    log('[ADB] authenticating')
    const transport = await AdbDaemonTransport.authenticate({
      serial: device.serial || 'webusb-device',
      connection,
      credentialStore: credentials,
    })
    if (ticket !== generation) { await transport.close(); throw new Error('Conexão cancelada.') }
    adb = new Adb(transport)
    log('[ADB] connected')
    const active = adb
    adb.disconnected.then(() => {
      if (adb !== active) return
      generation += 1
      closeCurrent()
      publish({ status: 'disconnected', device: null, error: 'A conexão USB foi perdida.' })
    }).catch(error => console.error('[ADB] disconnect failed', error))
    const info = await getDeviceInfo()
    if (ticket !== generation) throw new Error('Conexão cancelada.')
    publish({ status: 'connected', device: info, error: null })
    return info
  } catch (error) {
    if (ticket === generation) {
      console.error('[WebUSB] connect failed', { name: error?.name, message: error?.message, stack: error?.stack }, error)
      await closeCurrent()
      publish({ status: 'error', device: null, error: errorMessage(error) })
    }
    throw error
  }
}

export const webUsbAdb = {
  available() { return !!window.isSecureContext && !!manager },
  getState() { return state },
  subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener) },
  isConnected() { return !!adb },
  async knownDevices() { return manager ? manager.getDevices() : [] },
  connect() {
    if (!window.isSecureContext) return Promise.reject(new Error('WebUSB indisponível neste endereço. Utilize uma conexão HTTPS ou um contexto permitido pelo navegador.'))
    if (!manager) return Promise.reject(new Error('WebUSB indisponível. Use Chrome ou Edge.'))
    if (connecting) return connecting
    if (adb && state.status === 'connected') return Promise.resolve(state.device)
    // Invoke requestDevice synchronously from the user click, before any await.
    log('[WebUSB] requesting device')
    let request
    try { request = manager.requestDevice() }
    catch (error) { return Promise.reject(error) }
    publish({ status: 'requesting_device', error: null })
    connecting = request.then(device => {
      if (!device) throw new Error('A seleção do dispositivo foi cancelada.')
      log('[WebUSB] device selected', { name: device.name })
      return establish(device)
    }).catch(error => {
      if (state.status !== 'error') publish({ status: 'error', error: errorMessage(error) })
      throw error
    }).finally(() => { connecting = null })
    return connecting
  },
  async reconnect(device) {
    if (connecting) return connecting
    const known = device || (await this.knownDevices())[0]
    if (!known) throw new Error('Nenhum aparelho previamente autorizado foi encontrado.')
    connecting = establish(known).catch(error => {
      publish({ status: 'error', error: errorMessage(error) })
      throw error
    }).finally(() => { connecting = null })
    return connecting
  },
  async disconnect() {
    generation += 1
    await closeCurrent()
    publish({ status: 'idle', device: null, error: null })
  },
  async shell(command) {
    if (!adb) throw new Error('ADB não conectado.')
    const active = adb
    const ticket = generation
    log('[ADB] shell: ' + command)
    try {
      const output = await active.subprocess.noneProtocol.spawnWaitText(command)
      if (ticket !== generation || active !== adb) throw new Error('A conexão USB foi perdida.')
      log('[ADB] shell completed')
      return output
    } catch (error) {
      console.error('[ADB] shell failed', { command, name: error?.name, message: error?.message, stack: error?.stack }, error)
      throw error
    }
  },
  async getDeviceInfo() { return getDeviceInfo() },
  async startLogcat(onActivity = () => {}, onClose = () => {}) {
    if (!adb) throw new Error('ADB não conectado.')
    const active = adb
    const process = await active.subprocess.noneProtocol.spawn('logcat -T 1 -v brief ActivityTaskManager:I ActivityManager:I *:S')
    const reader = process.output.getReader()
    const decoder = new TextDecoder()
    let stopped = false
    let buffer = ''
    const pump = (async () => {
      try {
        while (!stopped && active === adb) {
          const { done, value } = await reader.read()
          if (done) break
          buffer = (buffer + decoder.decode(value, { stream: true })).slice(-16384)
          const lines = buffer.split(/\r?\n/)
          buffer = lines.pop()
          if (lines.some(line => /Displayed|START u|ResumedActivity/.test(line))) onActivity()
        }
      } catch (error) {
        if (!stopped) console.error('[ADB] logcat failed', error)
      } finally {
        if (!stopped) onClose()
      }
    })()
    return async () => {
      stopped = true
      await reader.cancel().catch(() => {})
      await process.kill().catch(() => {})
      await pump.catch(() => {})
    }
  },
  async listPackages() {
    const output = await this.shell('pm list packages')
    return output.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('package:')).map(line => line.slice(8))
  },
}

async function getDeviceInfo() {
  const manufacturer = (await webUsbAdb.shell('getprop ro.product.manufacturer')).trim()
  const model = (await webUsbAdb.shell('getprop ro.product.model')).trim()
  const android_version = (await webUsbAdb.shell('getprop ro.build.version.release')).trim()
  const sdk_version = (await webUsbAdb.shell('getprop ro.build.version.sdk')).trim()
  if (!manufacturer || !model || !android_version || !sdk_version) throw new Error('getprop retornou dados incompletos.')
  return { connected: true, status: 'device', manufacturer, model, android_version, sdk_version, serial: null, serial_masked: 'USB direto' }
}

if (manager) {
  navigator.usb.addEventListener('disconnect', event => {
    if (selected?.raw !== event.device) return
    generation += 1
    closeCurrent()
    publish({ status: 'disconnected', device: null, error: 'A conexão USB foi perdida.' })
  })
}


