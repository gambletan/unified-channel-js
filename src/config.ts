/** Config file support — load ChannelManager from YAML/JSON config. */

import { readFile } from "node:fs/promises";
import { ChannelManager } from "./manager.js";

/** Interpolate ${ENV_VAR} in a string, with optional ${ENV_VAR:-default}. */
export function interpolateEnv(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, expr: string) => {
    const colonIdx = expr.indexOf(":-");
    if (colonIdx !== -1) {
      const varName = expr.slice(0, colonIdx);
      const defaultVal = expr.slice(colonIdx + 2);
      return process.env[varName] ?? defaultVal;
    }
    const envVal = process.env[expr];
    if (envVal === undefined) {
      throw new Error(`Environment variable ${expr} is not set`);
    }
    return envVal;
  });
}

/**
 * Minimal YAML parser for simple key-value structures.
 * Supports:
 *   - Nested objects via indentation
 *   - String values (quoted or unquoted)
 *   - Env var interpolation ${VAR}
 *
 * Does NOT support arrays, multiline strings, anchors, etc.
 * For complex configs, use JSON format instead.
 */
export function parseSimpleYaml(text: string): Record<string, unknown> {
  const lines = text.split("\n");
  const root: Record<string, unknown> = {};
  const stack: { indent: number; obj: Record<string, unknown> }[] = [{ indent: -1, obj: root }];

  for (const rawLine of lines) {
    // Skip comments and empty lines
    const commentIdx = rawLine.indexOf("#");
    const line = commentIdx !== -1 ? rawLine.slice(0, commentIdx) : rawLine;
    if (line.trim() === "") continue;

    const stripped = line.trimEnd();
    const indent = stripped.length - stripped.trimStart().length;
    const content = stripped.trim();

    const colonIdx = content.indexOf(":");
    if (colonIdx === -1) continue;

    const key = content.slice(0, colonIdx).trim();
    const rawValue = content.slice(colonIdx + 1).trim();

    // Pop stack back to parent level
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].obj;

    if (rawValue === "") {
      // Nested object
      const child: Record<string, unknown> = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else {
      // Scalar value — strip quotes and interpolate
      let value = rawValue;
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      parent[key] = interpolateEnv(value);
    }
  }

  return root;
}

export interface ChannelConfig {
  channels?: Record<string, Record<string, string>>;
  middleware?: {
    access?: { allowedUsers?: string[] };
  };
}

/**
 * Load a ChannelManager from a config file (YAML or JSON).
 *
 * The config specifies channel adapters and their options.
 * Adapter modules are dynamically imported from `unified-channel/adapters/<name>`.
 *
 * @param path - Path to config file. Defaults to `./unified-channel.yml`.
 *               Supports `.json`, `.yml`, `.yaml`.
 */
export async function loadConfig(path?: string): Promise<ChannelManager> {
  const configPath = path ?? "./unified-channel.yml";
  const content = await readFile(configPath, "utf-8");

  let config: ChannelConfig;

  if (configPath.endsWith(".json")) {
    // Parse JSON, then interpolate env vars in string values
    config = JSON.parse(content) as ChannelConfig;
    interpolateObject(config);
  } else {
    // Parse as simple YAML
    config = parseSimpleYaml(content) as ChannelConfig;
  }

  const manager = new ChannelManager();

  if (config.channels) {
    for (const [channelName, channelConfig] of Object.entries(config.channels)) {
      // Dynamic import of adapter — callers need the adapter packages installed
      try {
        const adapterModule = await import(`./adapters/${channelName}.js`);
        // Convention: adapter class is PascalCase(channelName) + "Adapter"
        const className = channelName.charAt(0).toUpperCase() + channelName.slice(1) + "Adapter";
        const AdapterClass = adapterModule[className];
        if (!AdapterClass) {
          throw new Error(`Adapter class ${className} not found in module`);
        }
        // Pass the config values as constructor args (token is the most common)
        const token = channelConfig.token ?? channelConfig.apiKey;
        const adapter = new AdapterClass(token, channelConfig);
        manager.addChannel(adapter);
      } catch (err) {
        throw new Error(
          `Failed to load adapter for channel "${channelName}": ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return manager;
}

/** Recursively interpolate env vars in all string values of an object. */
function interpolateObject(obj: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      obj[key] = interpolateEnv(value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      interpolateObject(value as Record<string, unknown>);
    }
  }
}
