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
    try {
      console.log("deleting old test pod...");
      const deletePodResult = await client.request(
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
      console.log("Delete pod result:", JSON.stringify(deletePodResult, null, 2));
      
      // Parse the delete result to check if pod was actually deleted or was already not found
      const deleteResult = JSON.parse(deletePodResult.content[0].text);
      
      // Only wait for termination if the pod was actually deleted (not if it was already not found)
      if (deleteResult.status === "deleted") {
        // Wait for pod to be fully terminated before creating a new one
        console.log("Pod was found and deletion initiated. Waiting for pod to be fully terminated...");
        
        // Poll until the pod is fully deleted (404 Not Found)
        let podDeleted = false;
        let retries = 0;
        const maxRetries = 140;
        
        while (!podDeleted && retries < maxRetries) {
          try {
            // Try to describe the pod - if it exists, this will succeed
            await client.request(
              {
                method: "tools/call",
                params: {
                  name: "describe_pod",
                  arguments: {
                    name: "logging-test-pod",
                    namespace: "default"
                  }
                }
              },
              ListPodsResponseSchema
            );
            
            // Pod still exists, wait and retry
            console.log(`Pod still terminating, waiting... (${retries + 1}/${maxRetries})`);
            retries++;
          } catch (error) {
            // If we get an error, it might be because the pod is gone (404)
            console.log("Pod appears to be deleted, proceeding with creation");
            podDeleted = true;
          }
        }
        
        if (!podDeleted) {
          console.warn("Warning: Pod might not be fully terminated, but proceeding anyway");
        }
      } else if (deleteResult.status === "not_found") {
        console.log("Pod was not found, no need to wait for termination");
      }
    } catch (error) {
      console.error("Error during pod deletion:", error);
      // Continue with the test even if deletion fails
      // The pod might not exist, which is fine
    }

    // Create a test pod that outputs logs
    console.log("Starting pod creation...");
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
    const maxRetries = 70; // Maximum number of retries (70 * 2 seconds = 140 seconds max wait time)
    
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
  }, { timeout: 120000 });
});
