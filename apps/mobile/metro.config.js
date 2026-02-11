const expoMetroConfig = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const getDefaultConfig =
  expoMetroConfig?.getDefaultConfig ??
  expoMetroConfig?.default?.getDefaultConfig ??
  (typeof expoMetroConfig === 'function' ? expoMetroConfig : undefined);

if (typeof getDefaultConfig !== 'function') {
  const keys = expoMetroConfig && typeof expoMetroConfig === 'object' ? Object.keys(expoMetroConfig) : [];
  throw new Error(
    `Invalid expo/metro-config export. Expected getDefaultConfig(). Got: ${typeof expoMetroConfig}. Keys: ${keys.join(', ')}`
  );
}

const config = getDefaultConfig(projectRoot);
config.resolver = config.resolver ?? {};

// In a pnpm monorepo, many packages resolve from the workspace root node_modules
// (including pnpm's .pnpm store). Metro must be allowed to watch/resolve there.
const extraWatchFolders = [path.resolve(workspaceRoot, 'packages'), workspaceRoot];
config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), ...extraWatchFolders]));

const extraNodeModulesPaths = [path.resolve(workspaceRoot, 'node_modules')];
config.resolver.nodeModulesPaths = Array.from(
  new Set([...(config.resolver.nodeModulesPaths ?? []), ...extraNodeModulesPaths])
);

module.exports = config;
