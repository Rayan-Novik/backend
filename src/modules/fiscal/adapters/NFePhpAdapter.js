import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class NFePhpAdapter {
  /**
   * Envia os dados para o script PHP (nfe-adapter.php) via STDIN
   * e aguarda a resposta JSON via STDOUT.
   */
  static async callAdapter(action, payload, config, certificadoBase64) {
    return new Promise((resolve, reject) => {
      const adapterPath = path.resolve(__dirname, '../../../../php-adapter');
      const scriptFile = 'nfe-adapter.php';

      const inputJson = JSON.stringify({
        action,
        payload,
        config,
        certificado: certificadoBase64
      });

      let command = 'php';
      let args = [scriptFile];

      // Verifica se o php está no PATH local ou no C:\xampp\php\php.exe
      try {
        execSync('php -v', { stdio: 'ignore' });
      } catch (e) {
        if (fs.existsSync('C:\\xampp\\php\\php.exe')) {
          command = 'C:\\xampp\\php\\php.exe';
        } else {
          command = 'docker';
          args = [
            'run', '--rm', '-i',
            '-v', path.resolve(__dirname, '../../../..') + ':/app',
            '-w', '/app/php-adapter',
            'fiscal-php',
            'php', scriptFile
          ];
        }
      }

      const child = spawn(command, args, { cwd: adapterPath });

      let stdoutData = '';
      let stderrData = '';

      child.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          console.error('ENOENT ERROR:', err);
          reject(new Error('PHP não encontrado no sistema. Por favor, instale o PHP CLI e adicione ao PATH.'));
        } else {
          reject(err);
        }
      });

      child.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`PHP Adapter exited with code ${code}. Stderr: ${stderrData} Stdout: ${stdoutData}`));
        }
        try {
          const jsonStart = stdoutData.indexOf('{');
          if (jsonStart === -1) {
            return reject(new Error('Saída inválida do PHP Adapter: ' + stdoutData));
          }
          const cleanJson = stdoutData.substring(jsonStart);
          const result = JSON.parse(cleanJson);
          try {
            fs.writeFileSync(path.join(adapterPath, 'nfe_debug.xml'), result.xml_gerado || '');
          } catch (_) {}
          resolve(result);
        } catch (e) {
          reject(new Error('Erro ao parsear JSON do PHP Adapter: ' + e.message + ' | Saída bruta: ' + stdoutData));
        }
      });

      child.stdin.write(inputJson);
      child.stdin.end();
    });
  }
}
