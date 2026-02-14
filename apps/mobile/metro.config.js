const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watchman has been flaky in some macOS + monorepo setups (it can deadlock and cause Metro to stop).
// Forcing the Node crawler makes Expo/Metro much more reliable at the cost of slightly higher CPU.
config.watcher = {
  ...(config.watcher ?? {}),
  useWatchman: false
};

// In a pnpm monorepo, many packages resolve from the workspace root node_modules
// (including pnpm's .pnpm store). Metro must be allowed to watch/resolve there.
const extraWatchFolders = [path.resolve(workspaceRoot, 'packages'), workspaceRoot];
config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), ...extraWatchFolders]));

const extraNodeModulesPaths = [path.resolve(workspaceRoot, 'node_modules')];
config.resolver.nodeModulesPaths = Array.from(
  new Set([...(config.resolver.nodeModulesPaths ?? []), ...extraNodeModulesPaths])
);

module.exports = config;
