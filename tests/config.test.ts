import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { interpolateEnv, parseSimpleYaml } from "../src/config.js";

describe("interpolateEnv", () => {
  beforeEach(() => {
    process.env.TEST_TOKEN = "my-secret-token";
    process.env.TEST_HOST = "localhost";
  });

  afterEach(() => {
    delete process.env.TEST_TOKEN;
    delete process.env.TEST_HOST;
  });

  it("replaces ${VAR} with env value", () => {
    expect(interpolateEnv("token: ${TEST_TOKEN}")).toBe("token: my-secret-token");
  });

  it("supports default values with ${VAR:-default}", () => {
    expect(interpolateEnv("${MISSING_VAR:-fallback}")).toBe("fallback");
  });

  it("throws on missing env var without default", () => {
    expect(() => interpolateEnv("${TOTALLY_MISSING}")).toThrow("Environment variable TOTALLY_MISSING is not set");
  });

  it("handles multiple vars in one string", () => {
    expect(interpolateEnv("${TEST_HOST}:${TEST_TOKEN}")).toBe("localhost:my-secret-token");
  });
});

describe("parseSimpleYaml", () => {
  beforeEach(() => {
    process.env.BOT_TOKEN = "abc123";
  });

  afterEach(() => {
    delete process.env.BOT_TOKEN;
  });

  it("parses flat key-value pairs", () => {
    const result = parseSimpleYaml('name: "my-app"\nport: 3000');
    expect(result).toEqual({ name: "my-app", port: "3000" });
  });

  it("parses nested objects via indentation", () => {
    const yaml = `
channels:
  telegram:
    token: "test-token"
  discord:
    token: "disc-token"
`;
    const result = parseSimpleYaml(yaml);
    expect(result).toEqual({
      channels: {
        telegram: { token: "test-token" },
        discord: { token: "disc-token" },
      },
    });
  });

  it("interpolates env vars in values", () => {
    const yaml = `
channels:
  telegram:
    token: "\${BOT_TOKEN}"
`;
    const result = parseSimpleYaml(yaml);
    expect((result as any).channels.telegram.token).toBe("abc123");
  });

  it("ignores comments and blank lines", () => {
    const yaml = `
# This is a comment
name: test

# Another comment
port: 8080
`;
    const result = parseSimpleYaml(yaml);
    expect(result).toEqual({ name: "test", port: "8080" });
  });
});
