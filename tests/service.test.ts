// This test file is used to test Kubernetes Service functionalities
import { expect, test, describe, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CreateNamespaceResponseSchema } from "../src/types";
import { KubernetesManager } from "../src/types";
import { z } from "zod";

// Define the schema for the Service response
const ServiceResponseSchema = z.any();

// Interface for service response type
interface ServiceResponse {
  serviceName: string;
  namespace: string;
  type: string;
  clusterIP: string;
  ports: Array<{
    port: number;
    targetPort: number | string;
    protocol: string;
    name: string;
    nodePort?: number;
  }>;
  status: string;
}

// Interface for list services response
interface ListServicesResponse {
  services: Array<{
    name: string;
    namespace: string;
    type: string;
    clusterIP: string;
    ports: Array<any>;
    createdAt: string;
  }>;
}

// Interface for update service response
interface UpdateServiceResponse {
  message: string;
  service: {
    name: string;
    namespace: string;
    type: string;
    clusterIP: string;
    ports: Array<any>;
  };
}

// Interface for delete service response
interface DeleteServiceResponse {
  success: boolean;
  status: string;
}

// Utility function: Sleep for a specified number of milliseconds
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Utility function: Generate a random ID string
function generateRandomId(): string {
  return Math.random().toString(36).substring(2, 10);
}

// Utility function: Generate a random SHA string for resource naming in tests
function generateRandomSHA(): string {
  return Math.random().toString(36).substring(2, 15);
}

// Utility function: Parse JSON response
function parseServiceResponse(responseText: string): ServiceResponse | null {
  try {
    return JSON.parse(responseText);
  } catch (error) {
    console.error("Failed to parse service response:", error);
    return null;
  }
}

// Utility function: Parse list services response
function parseListServicesResponse(responseText: string): ListServicesResponse | null {
  try {
    return JSON.parse(responseText);
  } catch (error) {
    console.error("Failed to parse list services response:", error);
    return null;
  }
}

// Utility function: Parse update service response
function parseUpdateServiceResponse(responseText: string): UpdateServiceResponse | null {
  try {
    return JSON.parse(responseText);
  } catch (error) {
    console.error("Failed to parse update service response:", error);
    return null;
  }
}

// Utility function: Parse delete service response
function parseDeleteServiceResponse(responseText: string): DeleteServiceResponse | null {
  try {
    return JSON.parse(responseText);
  } catch (error) {
    console.error("Failed to parse delete service response:", error);
    return null;
  }
}

// Test suite: Testing Service functionality
describe("test kubernetes service", () => {
  let transport: StdioClientTransport;
  let client: Client;
  const NAMESPACE_PREFIX = "test-service";
  let testNamespace: string;

  const testServiceName = `test-service-${generateRandomSHA()}`;

  // Setup before each test
  beforeEach(async () => {
    try {
      // Initialize client transport layer, communicating with the service process via stdio
      transport = new StdioClientTransport({
        command: "bun",
        args: ["src/index.ts"],
        stderr: "pipe",
      });

      // Create an instance of the MCP client
      client = new Client(
        {
          name: "test-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      // Connect to the service
      await client.connect(transport);
      // Wait for the connection to be established
      await sleep(1000);

      // Create a unique test namespace to isolate the test environment
      testNamespace = `${NAMESPACE_PREFIX}-${generateRandomId()}`;
      console.log(`Creating test namespace: ${testNamespace}`);

      // Call API to create the namespace
      await client.request<any>(
        {
          method: "tools/call",
          params: {
            name: "create_namespace",
            arguments: {
              name: testNamespace,
            },
          },
        },
        CreateNamespaceResponseSchema,
      );

      // Wait for the namespace to be fully created
      await sleep(2000);
    } catch (error: any) {
      console.error("Error in beforeEach:", error);
      throw error;
    }
  });

  // Cleanup after each test
  afterEach(async () => {
    try {
      // Clean up the test namespace by directly calling the API
      console.log(`Cleaning up test namespace: ${testNamespace}`);
      const k8sManager = new KubernetesManager();

      // @ts-ignore
      await k8sManager.getCoreApi().deleteNamespace(testNamespace);

      // Close the client connection
      await transport.close();
      await sleep(1000);
    } catch (e) {
      console.error("Error during cleanup:", e);
    }
  });

  // Test case: Test complete lifecycle of a service (create, list, describe, update, delete)
  test("complete service lifecycle", async () => {
    // Define test port configuration
    const testPorts = [
      {
        port: 80,
        targetPort: 8080,
        protocol: "TCP",
        name: "http"
      }
    ];

    // Define test selector
    const testSelector = {
      app: "test-app",
      tier: "backend"
    };

    // Step 1: Create a ClusterIP service
    console.log("Creating service:", testServiceName);
    const serviceResponse = await client.request<any>(
      {
        method: "tools/call",
        params: {
          name: "create_service",
          arguments: {
            name: testServiceName,
            namespace: testNamespace,
            type: "ClusterIP",
            selector: testSelector,
            ports: testPorts,
          },
        },
      },
      ServiceResponseSchema,
    );

    // Wait for the request to be processed
    await sleep(2000);

    // Parse the service response
    const responseText = serviceResponse.content[0].text;
    const parsedResponse = parseServiceResponse(responseText);

    console.log("Service creation response:", parsedResponse);

    // Verify that the response contains the expected data
    expect(parsedResponse).not.toBeNull();
    expect(parsedResponse?.serviceName).toBe(testServiceName);
    expect(parsedResponse?.namespace).toBe(testNamespace);
    expect(parsedResponse?.type).toBe("ClusterIP");
    expect(parsedResponse?.status).toBe("created");

    // Step 2: List services in the namespace
    console.log("Listing services in namespace:", testNamespace);
    const listResponse = await client.request<any>(
      {
        method: "tools/call",
        params: {
          name: "list_services",
          arguments: {
            namespace: testNamespace,
          },
        },
      },
      ServiceResponseSchema,
    );

    // Parse the list response
    const listResponseText = listResponse.content[0].text;
    const parsedListResponse = parseListServicesResponse(listResponseText);

    console.log("Services list response:", parsedListResponse);

    // Verify that the service appears in the list
    expect(parsedListResponse).not.toBeNull();
    expect(parsedListResponse?.services).toBeInstanceOf(Array);
    expect(parsedListResponse?.services.length).toBeGreaterThan(0);
    
    // Find our service in the list
    const listedService = parsedListResponse?.services.find(svc => svc.name === testServiceName);
    expect(listedService).toBeDefined();
    expect(listedService?.namespace).toBe(testNamespace);
    expect(listedService?.type).toBe("ClusterIP");

    // Step 3: Describe the service
    console.log("Describing service:", testServiceName);
    const describeResponse = await client.request<any>(
      {
        method: "tools/call",
        params: {
          name: "describe_service",
          arguments: {
            name: testServiceName,
            namespace: testNamespace,
          },
        },
      },
      ServiceResponseSchema,
    );

    // Parse the describe response
    const describeResponseText = describeResponse.content[0].text;
    const serviceDetails = JSON.parse(describeResponseText);

    console.log("Service details:", serviceDetails);

    // Verify service details
    expect(serviceDetails).not.toBeNull();
    expect(serviceDetails.metadata.name).toBe(testServiceName);
    expect(serviceDetails.metadata.namespace).toBe(testNamespace);
    expect(serviceDetails.spec.type).toBe("ClusterIP");
    expect(serviceDetails.spec.selector).toEqual(testSelector);
    expect(serviceDetails.spec.ports).toHaveLength(1);
    expect(serviceDetails.spec.ports[0].port).toBe(80);
    expect(serviceDetails.spec.ports[0].targetPort).toBe(8080);

    // Step 4: Update the service
    console.log("Updating service:", testServiceName);
    const updatedPorts = [
      {
        port: 8080,
        targetPort: 9090,
        protocol: "TCP",
        name: "http-updated"
      }
    ];

    const updatedSelector = {
      app: "test-app-updated",
      tier: "frontend"
    };

    const updateResponse = await client.request<any>(
      {
        method: "tools/call",
        params: {
          name: "update_service",
          arguments: {
            name: testServiceName,
            namespace: testNamespace,
            ports: updatedPorts,
            selector: updatedSelector
          },
        },
      },
      ServiceResponseSchema,
    );

    // Wait for the update to be processed
    await sleep(2000);

    // Parse the update response
    const updateResponseText = updateResponse.content[0].text;
    const parsedUpdateResponse = parseUpdateServiceResponse(updateResponseText);

    console.log("Service update response:", parsedUpdateResponse);

    // Verify the update was successful
    expect(parsedUpdateResponse).not.toBeNull();
    expect(parsedUpdateResponse?.message).toBe("Service updated successfully");
    expect(parsedUpdateResponse?.service.name).toBe(testServiceName);
    
    // Verify updated properties
    expect(parsedUpdateResponse?.service.ports).toHaveLength(1);
    expect(parsedUpdateResponse?.service.ports[0].port).toBe(8080);
    expect(parsedUpdateResponse?.service.ports[0].targetPort).toBe(9090);

    // Step 5: Describe the service again to verify updates
    console.log("Describing updated service:", testServiceName);
    const describeUpdatedResponse = await client.request<any>(
      {
        method: "tools/call",
        params: {
          name: "describe_service",
          arguments: {
            name: testServiceName,
            namespace: testNamespace,
          },
        },
      },
      ServiceResponseSchema,
    );

    // Parse the describe response
    const describeUpdatedResponseText = describeUpdatedResponse.content[0].text;
    const updatedServiceDetails = JSON.parse(describeUpdatedResponseText);

    console.log("Updated service details:", updatedServiceDetails);

    // Verify service details reflect the updates
    expect(updatedServiceDetails.spec.selector).toEqual(updatedSelector);
    expect(updatedServiceDetails.spec.ports).toHaveLength(1);
    expect(updatedServiceDetails.spec.ports[0].port).toBe(8080);
    expect(updatedServiceDetails.spec.ports[0].targetPort).toBe(9090);
    expect(updatedServiceDetails.spec.ports[0].name).toBe("http-updated");

    // Step 6: Delete the service
    console.log("Deleting service:", testServiceName);
    const deleteResponse = await client.request<any>(
      {
        method: "tools/call",
        params: {
          name: "delete_service",
          arguments: {
            name: testServiceName,
            namespace: testNamespace,
          },
        },
      },
      ServiceResponseSchema,
    );

    // Wait for the delete to be processed
    await sleep(2000);

    // Parse the delete response
    const deleteResponseText = deleteResponse.content[0].text;
    const parsedDeleteResponse = parseDeleteServiceResponse(deleteResponseText);

    console.log("Service deletion response:", parsedDeleteResponse);

    // Verify the delete was successful
    expect(parsedDeleteResponse).not.toBeNull();
    expect(parsedDeleteResponse?.success).toBe(true);
    expect(parsedDeleteResponse?.status).toBe("deleted");

    // Step 7: List services again to verify deletion
    console.log("Listing services after deletion:");
    const listAfterDeleteResponse = await client.request<any>(
      {
        method: "tools/call",
        params: {
          name: "list_services",
          arguments: {
            namespace: testNamespace,
          },
        },
      },
      ServiceResponseSchema,
    );

    // Parse the list response
    const listAfterDeleteResponseText = listAfterDeleteResponse.content[0].text;
    const parsedListAfterDeleteResponse = parseListServicesResponse(listAfterDeleteResponseText);

    console.log("Services list after deletion:", parsedListAfterDeleteResponse);

    // Verify the service is no longer in the list
    expect(parsedListAfterDeleteResponse).not.toBeNull();
    expect(parsedListAfterDeleteResponse?.services).toBeInstanceOf(Array);
    
    // Service should not be found
    const deletedService = parsedListAfterDeleteResponse?.services.find(svc => svc.name === testServiceName);
    expect(deletedService).toBeUndefined();
  });

  // Test case: Verify creation of NodePort service
  test("verify creation of NodePort service", async () => {
    // Define test port configuration that includes nodePort
    const testPorts = [
      {
        port: 80,
        targetPort: 8080,
        protocol: "TCP",
        name: "http",
        nodePort: 30080
      }
    ];

    // Send request to create a NodePort service
    const serviceResponse = await client.request<any>(
      {
        method: "tools/call",
        params: {
          name: "create_service",
          arguments: {
            name: `${testServiceName}-nodeport`,
            namespace: testNamespace,
            type: "NodePort",
            ports: testPorts,
          },
        },
      },
      ServiceResponseSchema,
    );

    // Wait for the request to be processed
    await sleep(2000);

    // Parse the service response
    const responseText = serviceResponse.content[0].text;
    const parsedResponse = parseServiceResponse(responseText);

    console.log("NodePort service creation response:", parsedResponse);

    // Verify that the response contains the expected data
    expect(parsedResponse).not.toBeNull();
    expect(parsedResponse?.type).toBe("NodePort");
    expect(parsedResponse?.status).toBe("created");

    // Verify port configuration, including NodePort
    expect(parsedResponse?.ports).toHaveLength(1);
    expect(parsedResponse?.ports[0].nodePort).toBeDefined();
    expect(parsedResponse?.ports[0].port).toBe(80);
  });
});