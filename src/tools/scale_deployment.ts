import * as k8s from "@kubernetes/client-node";
import { KubernetesManager } from "../types.js";
import { boolean } from "zod";
import { spec } from "node:test/reporters";

export const scaleDeploymentSchema = {
    name : "scale_deployment",
    description : "Scale a Kubernetes deployment",
    inputSchema : {
        type : "object",
        properties : {
            name : { type : "string" },
            namespace : { type : "string" },
            replicas : { type : "number" }
        },
        required : ["name", "namespace", "replicas"]
    }
}


export async function scaleDeployment(
    k8sManager: KubernetesManager,
    input:{
        name : string,
        namespace : string,
        replicas : number
    }
): Promise<{content : {success : boolean ; messsage : string}[]}> {
    const scale = k8sManager.getAppsApi().readNamespacedDeploymentScale(input.name, input.namespace);
    console.log(scale);
}

  