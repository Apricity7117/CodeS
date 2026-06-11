const ENV_KEYS = {
  approvalPolicy: ['CODES_APPROVAL_POLICY', 'CODEXUI_APPROVAL_POLICY'],
  sandboxMode: ['CODES_SANDBOX_MODE', 'CODEXUI_SANDBOX_MODE'],
}

function readTrimmedEnv(key) {
  return process.env[key]?.trim() ?? ''
}

function readFirstTrimmedEnv(keys) {
  for (const key of keys) {
    const value = readTrimmedEnv(key)
    if (value) return value
  }
  return ''
}

function setEnvValues(keys, value) {
  for (const key of keys) {
    process.env[key] = value
  }
}

module.exports = {
  ENV_KEYS,
  readFirstTrimmedEnv,
  setEnvValues,
}
