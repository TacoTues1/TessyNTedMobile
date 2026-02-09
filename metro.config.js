const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Required for expo-router (web)
config.transformer.unstable_allowRequireContext = true;

module.exports = config;