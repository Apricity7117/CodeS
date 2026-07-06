const PROJECT_CONFIG = require('../configs/runtime_defaults.json')
const PROJECT_DEFAULTS = PROJECT_CONFIG.defaults
const ENV_KEYS = PROJECT_CONFIG.envKeys

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

function readIntegerEnv(keys, fallback) {
  const value = readFirstTrimmedEnv(keys)
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readBooleanEnv(keys, fallback) {
  const value = readFirstTrimmedEnv(keys)
  if (!value) return fallback
  const normalized = value.toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

module.exports = {
  PROJECT_CONFIG,
  PROJECT_DEFAULTS,
  ENV_KEYS,
  readBooleanEnv,
  readFirstTrimmedEnv,
  readIntegerEnv,
  setEnvValues,
}
