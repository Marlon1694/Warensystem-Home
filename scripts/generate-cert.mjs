/**
 * Erzeugt ein selbstsigniertes Zertifikat für den Server im Heimnetz.
 *
 * Hintergrund: Safari auf iPhone und iPad gibt die Kamera – und damit den
 * Barcode-Scanner – nur in einem sicheren Kontext frei. Über http://192.168.x.x
 * bleibt sie gesperrt, über https:// funktioniert sie, sobald das Zertifikat
 * auf dem Gerät als vertrauenswürdig eingestuft wurde.
 *
 * Das Zertifikat trägt alle IPv4-Adressen dieses Rechners sowie seinen
 * Hostnamen als alternative Namen ein. Ohne passenden Eintrag lehnt iOS die
 * Verbindung auch dann ab, wenn das Zertifikat installiert ist.
 *
 *   node scripts/generate-cert.mjs            # Adressen automatisch erkennen
 *   node scripts/generate-cert.mjs 192.168.1.50 vorrat.fritz.box
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const certDir = join(rootDir, 'certs');
const keyFile = join(certDir, 'server.key');
const certFile = join(certDir, 'server.crt');
const configFile = join(certDir, 'openssl.cnf');

const VALID_DAYS = 825; // Apple akzeptiert keine längere Laufzeit.

function localIPv4() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address);
}

function isIPv4(value) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(value);
}

function ensureOpenssl() {
  try {
    execFileSync('openssl', ['version'], { stdio: 'pipe' });
  } catch {
    console.error(
      'openssl wurde nicht gefunden.\n' +
      '  Debian/Ubuntu/Raspberry Pi OS: sudo apt install openssl\n' +
      '  macOS: bereits enthalten\n' +
      '  Windows: in Git Bash enthalten oder über https://slproweb.com/products/Win32OpenSSL.html',
    );
    process.exit(1);
  }
}

const extra = process.argv.slice(2);
const host = hostname();

const addresses = [...new Set([...localIPv4(), ...extra.filter(isIPv4)])];
const names = [...new Set(['localhost', host, `${host}.local`, ...extra.filter((value) => !isIPv4(value))])];

ensureOpenssl();
mkdirSync(certDir, { recursive: true });

const altNames = [
  ...names.map((name, index) => `DNS.${index + 1} = ${name}`),
  'IP.1 = 127.0.0.1',
  ...addresses.map((address, index) => `IP.${index + 2} = ${address}`),
].join('\n');

writeFileSync(configFile, `[req]
default_bits       = 2048
prompt             = no
distinguished_name = dn
x509_extensions    = v3_req

[dn]
CN = Warensystem Home

[v3_req]
basicConstraints = critical, CA:FALSE
keyUsage         = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName   = @alt_names

[alt_names]
${altNames}
`, 'utf8');

execFileSync('openssl', [
  'req', '-x509', '-nodes', '-newkey', 'rsa:2048',
  '-days', String(VALID_DAYS),
  '-keyout', keyFile,
  '-out', certFile,
  '-config', configFile,
], { stdio: 'pipe' });

rmSync(configFile, { force: true });

console.log('Zertifikat erzeugt:');
console.log(`  Schlüssel:  ${keyFile}`);
console.log(`  Zertifikat: ${certFile}`);
console.log(`  Gültig:     ${VALID_DAYS} Tage`);
console.log(`  Gilt für:   ${[...names, '127.0.0.1', ...addresses].join(', ')}`);
console.log('\nNächste Schritte:');
console.log('  1. Server neu starten – er verwendet das Zertifikat automatisch.');
console.log('  2. Auf dem iPhone https://<Adresse>:4000 öffnen, Warnung bestätigen,');
console.log('     das Profil laden und unter Einstellungen → Allgemein → Info →');
console.log('     Zertifikatsvertrauenseinstellungen dem Zertifikat vollständig vertrauen.');
console.log('  3. Erst danach gibt Safari die Kamera für den Scanner frei.');
