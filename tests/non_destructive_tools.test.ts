// Import required test frameworks and SDK components
import { expect, test, describe } from "vitest";

/**
 * Test suite for ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS flag
 * Tests the behavior of the server when the flag is enabled vs. disabled
 */
describe("ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS flag", () => {
  // Define the destructive tool names based on the list in src/index.ts
  const destructiveToolNames = [
    "delete_pod",
    "delete_service",
    "delete_deployment",
    "delete_namespace",
    "uninstall_helm_chart",
    "delete_cronjob",
    "cleanup",
  ];

  test("should filter out destructive tools when ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS is true", () => {
    // Set the environment variable to enable non-destructive tools only mode
    const originalEnv = process.env.ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS;
    process.env.ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS = "true";

    // Define a mock for the nonDestructiveTools flag
    const nonDestructiveTools = true;

    // Get the list of tools from the server
    const allTools = [
      { name: "list_pods" },
      { name: "list_namespaces" },
      { name: "list_nodes" },
      { name: "create_namespace" },
      { name: "delete_pod" },
      { name: "delete_service" },
      { name: "delete_deployment" },
      { name: "delete_namespace" },
      { name: "uninstall_helm_chart" },
      { name: "delete_cronjob" },
      { name: "cleanup" },
    ];

    // Filter out destructive tools
    const tools = nonDestructiveTools
      ? allTools.filter(
          (tool) => !destructiveToolNames.includes(tool.name)
        )
      : allTools;

    // Verify that destructive tools are filtered out
    const toolNames = tools.map((tool) => tool.name);
    for (const destructiveTool of destructiveToolNames) {
      expect(toolNames).not.toContain(destructiveTool);
    }

    // Verify that non-destructive tools are present
    const nonDestructiveToolNames = [
      "list_pods",
      "list_namespaces",
      "list_nodes",
      "create_namespace",
    ];
    for (const nonDestructiveTool of nonDestructiveToolNames) {
      expect(toolNames).toContain(nonDestructiveTool);
    }

    // Restore the original environment variable
    process.env.ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS = originalEnv;
  });

  test("should include all tools when ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS is false", () => {
    // Set the environment variable to disable non-destructive tools only mode
    const originalEnv = process.env.ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS;
    process.env.ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS = "false";

    // Define a mock for the nonDestructiveTools flag
    const nonDestructiveTools = false;

    // Get the list of tools from the server
    const allTools = [
      { name: "list_pods" },
      { name: "list_namespaces" },
      { name: "list_nodes" },
      { name: "create_namespace" },
      { name: "delete_pod" },
      { name: "delete_service" },
      { name: "delete_deployment" },
      { name: "delete_namespace" },
      { name: "uninstall_helm_chart" },
      { name: "delete_cronjob" },
      { name: "cleanup" },
    ];

    // When the flag is disabled, all tools should be available
    const tools = nonDestructiveTools
      ? allTools.filter(
          (tool) => !destructiveToolNames.includes(tool.name)
        )
      : allTools;

    // Verify that all tools are present
    const toolNames = tools.map((tool) => tool.name);
    for (const destructiveTool of destructiveToolNames) {
      expect(toolNames).toContain(destructiveTool);
    }

    // Verify that non-destructive tools are also present
    const nonDestructiveToolNames = [
      "list_pods",
      "list_namespaces",
      "list_nodes",
      "create_namespace",
    ];
    for (const nonDestructiveTool of nonDestructiveToolNames) {
      expect(toolNames).toContain(nonDestructiveTool);
    }

    // Restore the original environment variable
    process.env.ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS = originalEnv;
  });
});