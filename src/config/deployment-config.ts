import { ContainerTemplate } from "./container-templates.js";

export const createDeploymentSchema = {
  name: "create_deployment",
  description: "Create a new Kubernetes deployment",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
      namespace: { type: "string" },
      template: {
        type: "string",
        enum: ContainerTemplate.options,
      },
      replicas: { type: "number", default: 1 },
      ports: {
        type: "array",
        items: { type: "number" },
        optional: true,
      },
    },
    required: ["name", "namespace", "template"],
  },
} as const;
