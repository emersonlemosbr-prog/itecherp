import { webUsbAdb } from './WebUsbAdbService'
import { analyzePackage } from './analyzer'

// Essential Android packages remain protected from removal.
export const PROTECTED_PACKAGES = new Set([
  'android',
  'com.android.systemui',
  'com.google.android.gms',
  'com.google.android.gsf',
  'com.android.vending',
  'com.google.android.play.games',
  'com.google.android.apps.messaging',
  'com.samsung.android.messaging',
  'com.android.providers.media',
  'com.android.providers.settings',
])

function validatePackage(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/.test(name)) throw new Error('Nome de pacote inválido.')
  return name
}

export async function getPackageInfo(name) {
  validatePackage(name)
  const [path, raw] = await Promise.all([
    webUsbAdb.shell('pm path ' + name),
    webUsbAdb.shell('dumpsys package ' + name),
  ])
  const versionLines = raw.split(/\r?\n/).filter(line => line.includes('versionName'))
  const permissions = raw.split(/\r?\n/).filter(line => line.includes('permission')).slice(0, 20)
  const protectedBySystem = PROTECTED_PACKAGES.has(name)
  return {
    package_name: name,
    app_name: name,
    version_name: versionLines.find(line => line.includes('versionName'))?.split('=')?.[1]?.trim() || 'N/D',
    version_code: versionLines.find(line => line.includes('versionCode'))?.split('=')?.[1]?.trim() || 'N/D',
    apk_path: path.split(/\r?\n/).map(line => line.trim()).filter(Boolean).join(', ') || null,
    permissions,
    is_system_package: protectedBySystem,
    protected: protectedBySystem,
    removable: !protectedBySystem,
  }
}

export async function scanDevice(onProgress = () => {}) {
  if (!webUsbAdb.isConnected()) throw new Error('Conecte o Android antes da varredura.')
  const packages = await webUsbAdb.listPackages()
  const results = new Array(packages.length)
  let next = 0
  let completed = 0
  async function worker() {
    while (next < packages.length) {
      if (!webUsbAdb.isConnected()) throw new Error('A conexão USB foi perdida durante a varredura.')
      const index = next++
      const name = packages[index]
      try {
        const info = await getPackageInfo(name)
        results[index] = { ...info, ...analyzePackage(info) }
      } catch (error) {
        if (!webUsbAdb.isConnected()) throw new Error('A conexão USB foi perdida durante a varredura.')
        console.error('[ADB] package analysis failed', name, error)
        results[index] = {
          package_name: name, app_name: name, version_name: 'N/D', version_code: 'N/D',
          risk_level: 'safe', risk_label: 'Análise indisponível', status: 'failed',
          reason: error?.message || 'Não foi possível analisar este pacote.',
          protected: true, removable: false,
        }
      }
      completed += 1
      onProgress({ completed, total: packages.length })
    }
  }
  await Promise.all([worker(), worker()])
  return results
}

export async function verifyPackageRemoved(name) {
  validatePackage(name)
  return !(await webUsbAdb.listPackages()).includes(name)
}

export async function removePackage(name, scanRow) {
  validatePackage(name)
  if (!scanRow || scanRow.package_name !== name || scanRow.protected || scanRow.removable === false || PROTECTED_PACKAGES.has(name)) {
    throw new Error('Pacote protegido ou não selecionado na varredura.')
  }
  const output = await webUsbAdb.shell('pm uninstall --user 0 ' + name)
  if (!/\bSuccess\b/.test(output)) throw new Error(output.trim() || 'A remoção não foi confirmada pelo Android.')
  if (!(await verifyPackageRemoved(name))) throw new Error('O pacote continua instalado após a tentativa de remoção.')
  return name
}


