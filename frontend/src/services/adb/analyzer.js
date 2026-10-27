const BLACKLIST = [
  'com.example.suspicious',
  'com.adware.spy',
  'com.malware.fakeguard',
  'com.fake.market',
  'com.android.systemupdate',
];

const SUSPICIOUS_KEYWORDS = [
  'adware',
  'spy',
  'malware',
  'trojan',
  'fake',
  'virus',
  'locker',
  'sms',
  'tracker',
  'ads',
  'redirect',
];

function getRiskLevel(score) {
  if (score >= 80) return 'threat';
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  if (score >= 10) return 'low';
  return 'safe';
}

function mapRiskLabel(level) {
  const labels = {
    safe: 'Seguro',
    low: 'Baixo risco',
    medium: 'Suspeito',
    high: 'Alto risco',
    threat: 'Ameaça conhecida',
  };
  return labels[level] || 'Seguro';
}

function analyzePackage(pkg = {}) {
  let score = 0;
  const reasons = [];
  const packageName = pkg.package_name || '';
  const appName = pkg.app_name || packageName;

  if (BLACKLIST.includes(packageName)) {
    score += 80;
    reasons.push('Package em blacklist');
  }

  if (pkg.apk_path && /sdcard|downloads|external/i.test(pkg.apk_path)) {
    score += 10;
    reasons.push('APK em diretório externo');
  }

  const combinedText = `${packageName} ${appName} ${(pkg.permissions || []).join(' ')}`.toLowerCase();
  const matchedKeyword = SUSPICIOUS_KEYWORDS.find((term) => combinedText.includes(term));
  if (matchedKeyword) {
    score += 25;
    reasons.push(`Indicador suspeito encontrado (${matchedKeyword})`);
  }

  const suspiciousPermissions = ['SEND_SMS', 'READ_SMS', 'READ_CONTACTS', 'CALL_PHONE', 'RECORD_AUDIO', 'ACCESS_FINE_LOCATION'];
  const riskyPermissions = (pkg.permissions || []).filter((permission) => suspiciousPermissions.includes(permission));
  if (riskyPermissions.length > 0) {
    score += riskyPermissions.length * 10;
    reasons.push(`Permissões sensíveis: ${riskyPermissions.join(', ')}`);
  }

  if (pkg.is_system_package) {
    score = Math.max(0, score - 20);
  }

  if (reasons.length === 0) {
    score = Math.min(score, 15);
  }

  const level = getRiskLevel(score);

  const protectedPackage = Boolean(pkg.protected || pkg.is_system_package);

  return {
    package_name: packageName,
    app_name: appName,
    version_name: pkg.version_name || 'N/D',
    version_code: pkg.version_code || 'N/D',
    apk_path: pkg.apk_path || null,
    sha256: pkg.sha256 || null,
    risk_score: Math.min(score, 100),
    risk_level: level,
    risk_label: mapRiskLabel(level),
    threat_type: level === 'safe' ? 'safe' : 'suspicious',
    reason: reasons.length ? reasons.join('; ') : 'Sem indicadores críticos conhecidos.',
    status: level === 'safe' ? 'safe' : 'detected',
    protected: protectedPackage,
    removable: !protectedPackage,
  };
}

export { analyzePackage };

