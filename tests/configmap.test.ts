import { expect, test, describe, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CreateNamespaceResponseSchema } from "../src/types";
import {
  CreateConfigMapResponseSchema,
  GetConfigMapResponseSchema,
  UpdateConfigMapResponseSchema,
  DeleteConfigMapResponseSchema,
} from "../src/models/response-schemas.js";
import { KubernetesManager } from "../src/types";
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateRandomId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function generateRandomSHA(): string {
  return Math.random().toString(36).substring(2, 15);
}

describe("test kubernetes configmap", () => {
  let transport: StdioClientTransport;
  let client: Client;
  const NAMESPACE_PREFIX = "test-configmap";
  let testNamespace: string;

  const testName = `test-configmap-${generateRandomSHA()}`;

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
      // Wait for connection to be established
      await sleep(1000);

      // Create a unique test namespace for test isolation
      testNamespace = `${NAMESPACE_PREFIX}-${generateRandomId()}`;
      console.log(`Creating test namespace: ${testNamespace}`);

      console.log("About to create namespace:", testNamespace);
      try {
        const namespaceResponse = await client.request({
          method: "tools/call",
          params: {
            name: "create_namespace",
            arguments: {
              name: testNamespace,
            },
          },
        }, GenericResponseSchema);
        console.log("Namespace creation response:", JSON.stringify(namespaceResponse));
      } catch (error) {
        console.error("Error creating namespace:", error);
        throw error;
      }

      // Wait for namespace to be fully created
      await sleep(2000);
    } catch (error: any) {
      console.error("Error in beforeEach:", error);
      throw error;
    }
  });

  afterEach(async () => {
    try {
      // Clean up namespace using direct API call
      console.log(`Cleaning up test namespace: ${testNamespace}`);
      const k8sManager = new KubernetesManager();
      await k8sManager.getCoreApi().deleteNamespace(testNamespace);

      // Close client connection
      await transport.close();
      await sleep(1000);
    } catch (e) {
      console.error("Error during cleanup:", e);
    }
  });

  test("verify creation of configmap", async () => {
    const testdata = {
      key1: "hello",
      key2: "world",
    };
    const configmap_response = client.request({
      method: "tools/call",
      params: {
        name: "create_configmap",
        arguments: {
          name: testName,
          namespace: testNamespace,
          data: testdata,
        },
      },
    }, GenericResponseSchema);

    await sleep(2000);
    const result = await configmap_response as any;
    console.log(result.result.content[0]);
    expect(result.result.content[0].success).toBe(true);
    expect(result.result.content[0].message).toContain(
      `Created ConfigMap ${testName} in namespace ${testNamespace}`
    );
  });

  test("verify get of configmap", async () => {
    const testdata = {
      key1: "foo",
      key2: "bar",
    };
    // Create first
    await client.request({
      method: "tools/call",
      params: {
        name: "create_configmap",
        arguments: {
          name: testName,
          namespace: testNamespace,
          data: testdata,
        },
      },
    }, GenericResponseSchema);
    await sleep(2000);

    // Get
    const get_response = await client.request({
      method: "tools/call",
      params: {
        name: "get_configmap",
        arguments: {
          name: testName,
          namespace: testNamespace,
        },
      },
    }, GenericResponseSchema) as any;
    expect(get_response.result.content[0].success).toBe(true);
    expect(get_response.result.content[0].message).toContain(
      `Fetched ConfigMap ${testName} in namespace ${testNamespace}`
    );
    expect(get_response.result.content[0].data).toEqual(testdata);
  });

  test("verify update of configmap", async () => {
    const testdata = {
      key1: "init",
      key2: "val",
    };
    // Create first
    await client.request({
      method: "tools/call",
      params: {
        name: "create_configmap",
        arguments: {
          name: testName,
          namespace: testNamespace,
          data: testdata,
        },
      },
    }, GenericResponseSchema);
    await sleep(2000);

    // Update
    const updatedData = {
      key1: "updated",
      key2: "val",
      key3: "new",
    };
    const update_response = await client.request({
      method: "tools/call",
      params: {
        name: "update_configmap",
        arguments: {
          name: testName,
          namespace: testNamespace,
          data: updatedData,
        },
      },
    }, GenericResponseSchema) as any;
    expect(update_response.result.content[0].success).toBe(true);
    expect(update_response.result.content[0].message).toContain(
      `Updated ConfigMap ${testName} in namespace ${testNamespace}`
    );

    // Get to verify update
    const get_response = await client.request({
      method: "tools/call",
      params: {
        name: "get_configmap",
        arguments: {
          name: testName,
          namespace: testNamespace,
        },
      },
    }, GenericResponseSchema) as any;
    expect(get_response.result.content[0].success).toBe(true);
    expect(get_response.result.content[0].data).toEqual(updatedData);
  });

  test("verify delete of configmap", async () => {
    const testdata = {
      key1: "to-be-deleted",
    };
    // Create first
    await client.request({
      method: "tools/call",
      params: {
        name: "create_configmap",
        arguments: {
          name: testName,
          namespace: testNamespace,
          data: testdata,
        },
      },
    }, GenericResponseSchema);
    await sleep(2000);

    // Delete
    const delete_response = await client.request({
      method: "tools/call",
      params: {
        name: "delete_configmap",
        arguments: {
          name: testName,
          namespace: testNamespace,
        },
      },
    }, GenericResponseSchema) as any;
    expect(delete_response.result.content[0].success).toBe(true);
    expect(delete_response.result.content[0].message).toContain(
      `Deleted ConfigMap ${testName} in namespace ${testNamespace}`
    );

    // Try to get, should fail
    const get_response = await client.request({
      method: "tools/call",
      params: {
        name: "get_configmap",
        arguments: {
          name: testName,
          namespace: testNamespace,
        },
      },
    }, GenericResponseSchema) as any;
    expect(get_response.result.content[0].success).toBe(false);
  });
});
