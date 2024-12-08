import { expect, test } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  GetContextsSchema,
  CreatePodSchema,
  PortForwardSchema,
  CleanupSchema,
  GetContextsSchemaResponse,
  CreatePodSchemaResponse,
  PortForwardSchemaResponse,
  ListResourcesSchemaResponse,
  CleanupSchemaResponse,
  DeletePodSchema,
  DeletePodSchemaResponse,
} from "./types.js";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("kubernetes server operations", async () => {
  const transport = new StdioClientTransport({
    command: "bun",
    args: ["src/index.ts"],
    stderr: "pipe",
  });
  transport.onmessage = (message) => {
    console.log("message:", message);
  };
  transport.onerror = (error) => {
    console.log("error:", error);
  };

  const client = new Client(
    {
      name: "test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );
  await client.connect(transport);

  try {
    // Test getting contexts
    const contexts = await client.request(
      {
        method: "getContexts",
      },
      GetContextsSchemaResponse
    );

    console.log(contexts.contexts);
    expect(contexts.contexts).toBeDefined();
    expect(Array.isArray(contexts.contexts)).toBe(true);

    // Delete pod if it exists
    const deletePod = await client.request(
      {
        method: "deletePod",
        params: {
          name: "test-pod",
          namespace: "default",
          ignoreNotFound: true,
        },
      },
      DeletePodSchemaResponse
    );
    expect(deletePod.success).toBe(true);
    await sleep(2000);
    console.log("pod deleted if existed");

    // Test creating a pod
    const pod = await client.request(
      {
        method: "createPod",
        params: {
          name: "test-pod",
          namespace: "default",
          template: "nginx",
        },
      },
      CreatePodSchemaResponse
    );
    expect(pod.podName).toBeDefined();
    console.log("pod created");

    // Test listing resources
    const resources = await client.request(
      {
        method: "listResources",
        params: { resourceType: "pod", namespace: "default" },
      },
      ListResourcesSchemaResponse
    );
    console.log("resources:", JSON.stringify(resources, null, 2));

    // Test port forwarding - todo not working yet
    // console.log('before port forward');
    // const pf = await client.request(
    //   {
    //     method: "portForward",
    //     params: {
    //       resourceType: "pod",
    //       name: "test-pod",
    //       namespace: "default",
    //       ports: [{ local: 8082, remote: 80 }]
    //     }
    //   },
    //   PortForwardSchemaResponse
    // );
    // console.log('port forward response:', pf);
    // expect(pf.id).toBeDefined();
    // expect(pf.success).toBe(true);
    // console.log('port forwarded');

    // Wait for pod to be ready
    // await sleep(10000);
    // console.log('pod ready');

    // Cleanup
    const cleanup = await client.request(
      {
        method: "cleanup",
      },
      CleanupSchemaResponse
    );
    expect(cleanup.success).toBe(true);
    console.log("cleanup done");
  } finally {
    // await client.disconnect();
  }
});
