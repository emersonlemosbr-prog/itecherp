
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');

// Isolamento obrigatório: nenhum teste pode acessar banco de produção.
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.DATABASE_URL = '';
process.env.POSTGRES_URL = '';
process.env.TEST_DATABASE_URL = '';
process.env.ITECH_DB_PATH = ':memory:';

const projectRoot = path.join(__dirname, '..', '..');
const backend = require('../server.js');

function countListeningServers() {
    return process.getActiveResourcesInfo()
        .filter((resource) => resource === 'TCPServerWrap').length;
}

function getFreePort() {
    return new Promise((resolve, reject) => {
        const probe = net.createServer();

        probe.on('error', reject);

        probe.listen(0, '127.0.0.1', () => {
            const port = probe.address().port;
            probe.close(() => resolve(port));
        });
    });
}

function waitForOutputOrExit(child, pattern, timeoutMs) {
    return new Promise((resolve, reject) => {
        let buffer = '';

        const timer = setTimeout(() => {
            reject(new Error(
                `Timeout (${timeoutMs}ms) esperando "${pattern}". Output:\n${buffer}`
            ));
        }, timeoutMs);

        const onData = (chunk) => {
            buffer += chunk.toString();

            if (pattern.test(buffer)) {
                clearTimeout(timer);
                resolve({ output: buffer });
            }
        };

        child.stdout.on('data', onData);
        child.stderr.on('data', onData);

        child.on('close', (code) => {
            if (!pattern.test(buffer)) {
                clearTimeout(timer);
                reject(new Error(
                    `Processo filho saiu com código ${code} antes de atingir "${pattern}". Output:\n${buffer}`
                ));
            }
        });
    });
}

function waitForExit(child, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('Timeout esperando o processo filho encerrar.'));
        }, timeoutMs);

        child.on('close', (code) => {
            clearTimeout(timer);
            resolve(code);
        });
    });
}

function httpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let body = '';

            res.on('data', (chunk) => {
                body += chunk;
            });

            res.on('end', () => {
                resolve({ status: res.statusCode, body });
            });
        }).on('error', reject);
    });
}

test('entrypoint: startServer exportada, importação não inicia servidor e não duplica listeners', async (t) => {
    assert.equal(
        typeof backend.startServer,
        'function',
        'startServer() deve estar exportada pelo backend'
    );

    assert.equal(
        countListeningServers(),
        0,
        'importar backend/server.js não deveria iniciar servidor automaticamente'
    );

const first = backend.startServer();

assert.ok(first, 'startServer() deveria iniciar o servidor');

// Aguarda o listener HTTP ficar realmente disponível.
if (!first.listening) {
    await new Promise((resolve, reject) => {
        first.once('listening', resolve);
        first.once('error', reject);
    });
}

assert.equal(
    countListeningServers(),
    1,
    'deveria existir exatamente um listener HTTP'
);

    const second = backend.startServer();

    assert.equal(
        second,
        first,
        'chamadas repetidas devem reutilizar a mesma instância'
    );

    assert.equal(
        countListeningServers(),
        1,
        'chamadas repetidas não podem duplicar listeners'
    );

t.after(async () => {
    if (first.listening) {
        await new Promise((resolve) => first.close(resolve));
    }
});
});

test('entrypoint: node server.js permanece ativo, responde HTTP e encerra com SIGTERM', async (t) => {
    const port = await getFreePort();

    const child = spawn(process.execPath, ['server.js'], {
        cwd: projectRoot,
        env: {
            ...process.env,
            PORT: String(port),
            NODE_ENV: 'test',
            DATABASE_URL: '',
            POSTGRES_URL: '',
            TEST_DATABASE_URL: '',
            ITECH_DB_PATH: ':memory:',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    t.after(() => {
        if (child.exitCode === null) {
            child.kill('SIGKILL');
        }
    });

    const { output } = await waitForOutputOrExit(
        child,
        /Backend Online/,
        20000
    );

    assert.ok(
        output.includes(`Porta: ${port}`),
        `o log deveria indicar a porta ${port}`
    );

    assert.equal(
        child.exitCode,
        null,
        'o processo deve permanecer ativo depois da inicialização'
    );

    const response = await httpGet(
        `http://127.0.0.1:${port}/api/health`
    );

    assert.equal(response.status, 200);
    assert.ok(response.body.includes('"status":"ok"'));
    assert.ok(response.body.includes('"entrypoint":"server.js"'));

    child.kill('SIGTERM');

    const exitCode = await waitForExit(child, 8000);

    if (process.platform === 'win32') {
        assert.equal(child.signalCode, 'SIGTERM', 'Processo encerrado pelo sinal solicitado');
    } else {
        assert.equal(exitCode, 0, 'SIGTERM deveria encerrar o processo com código 0');
    }
});
