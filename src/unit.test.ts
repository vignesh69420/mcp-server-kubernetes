import { expect, test, it, describe, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  ListToolsResponseSchema,
  ListPodsResponseSchema,
  ListDeploymentsResponseSchema,
  ListNamespacesResponseSchema,
  ListNodesResponseSchema,
  CreatePodResponseSchema,
  DeletePodResponseSchema,
  CleanupResponseSchema,
} from "./types.js";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("kubernetes server operations", () => {
  let transport: StdioClientTransport;
  let client: Client;


  beforeEach(async () => {
    try {
      transport = new StdioClientTransport({
        command: "bun",
        args: ["src/index.ts"],
        stderr: "pipe",
      });

      client = new Client(
        {
          name: "test-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );
      await client.connect(transport);
      // Wait for connection to be fully established
      await sleep(1000);
    } catch (e) {
      console.error("Error in beforeEach:", e);
      throw e;
    }
  });

  afterEach(async () => {
    try {
      await transport.close();
      await sleep(1000);
    } catch (e) {
      console.error("Error during cleanup:", e);
    }
  });

  test("list available tools", async () => {
    // List available tools stays the same
    console.log("Listing available tools...");
    const toolsList = await client.request(
      {
        method: "tools/list",
      },
      ListToolsResponseSchema
    );
    expect(toolsList.tools).toBeDefined();
    expect(toolsList.tools.length).toBeGreaterThan(0);

  });

  test("list namespaces and nodes", async () => {
    // List namespaces
    console.log("Listing namespaces...");
    const namespacesResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "list_namespaces",
          arguments: {},
        },
      },
      ListNamespacesResponseSchema
    );
    expect(namespacesResult.content[0].type).toBe("text");
    const namespaces = JSON.parse(namespacesResult.content[0].text);
    expect(namespaces.namespaces).toBeDefined();

    // List nodes
    console.log("Listing nodes...");
    const listNodesResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "list_nodes",
          arguments: {},
        },
      },
      ListNodesResponseSchema
    );
    expect(listNodesResult.content[0].type).toBe("text");
    const nodes = JSON.parse(listNodesResult.content[0].text);
    expect(nodes.nodes).toBeDefined();
    expect(Array.isArray(nodes.nodes)).toBe(true);

  });

  test("log operations", async () => {
    // 60 second timeout for this test
    //Delete test pod if exists first
    await client.request(
      {
        method: "tools/call",
        params: {
          name: "delete_pod",
          arguments: {
            name: "logging-test-pod",
            namespace: "default",
            ignoreNotFound: true
          },
        },
      },
      DeletePodResponseSchema
    );
    console.log("deleting old test pod...");

    // Create a test pod that outputs logs
    const createLoggingPodResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "create_pod",
          arguments: {
            name: "logging-test-pod",
            namespace: "default",
            template: "busybox",
            command: ["/bin/sh", "-c", "echo Test log message && sleep infinity"]
          },
        },
      },
      CreatePodResponseSchema
    );
    console.log("created new test pod...");
    expect(createLoggingPodResult.content[0].type).toBe("text");
    const loggingPodResult = JSON.parse(createLoggingPodResult.content[0].text);
    expect(loggingPodResult.podName).toBe("logging-test-pod");
    
    // Wait for pod to be in Running state before getting logs
    console.log("waiting for pod to be in Running state...");
    let podRunning = false;
    let retries = 0;
    const maxRetries = 30; // Maximum number of retries (30 * 2 seconds = 60 seconds max wait time)
    
    while (!podRunning && retries < maxRetries) {
      const podStatusResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "describe_pod",
            arguments: {
              name: "logging-test-pod",
              namespace: "default"
            },
          },
        },
        ListPodsResponseSchema
      );
      
      const podStatus = JSON.parse(podStatusResult.content[0].text);
      console.log(`Pod status: ${JSON.stringify(podStatus.status?.phase || "unknown")}`);
      
      if (podStatus.status?.phase === "Running") {
        podRunning = true;
        console.log("Pod is now running!");
      } else {
        console.log(`Pod not yet running, waiting... (${retries + 1}/${maxRetries})`);
        retries++;
        await sleep(2000);
      }
    }
    
    if (!podRunning) {
      throw new Error("Pod did not reach Running state within the timeout period");
    }
    
    // Now that the pod is running, get the logs
    console.log("checking pod logs...");
    const getLogsResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "get_logs",
          arguments: {
            resourceType: "pod",
            name: "logging-test-pod",
            namespace: "default",
            timestamps: true
          },
        },
      },
      ListPodsResponseSchema
    );
    expect(getLogsResult.content[0].type).toBe("text");
    const logs = JSON.parse(getLogsResult.content[0].text);
    expect(logs.logs["logging-test-pod"]).toContain("Test log message");
  });
});