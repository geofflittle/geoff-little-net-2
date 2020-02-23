import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceHandler } from "aws-lambda";
import { GetHostedZoneResponse, ResourceId } from "aws-sdk/clients/route53";
import { getHostedZone } from "../route53/getHostedZone";
import { updateDomainNameservers } from "../route53/updateDomainNameservers";
import { customResourceHandler } from "../cloudformation/customResourceHandler";
import { noOpHandler } from "../cloudformation/noOpHandler";

const createHandler = async (event: CloudFormationCustomResourceEvent) => {
    const hostedZoneId: ResourceId = event.ResourceProperties['HostedZone'];
    const hostedZone: GetHostedZoneResponse = await getHostedZone(hostedZoneId);
    await updateDomainNameservers(hostedZone.HostedZone.Name, (hostedZone.DelegationSet?.NameServers || [])
        .map(dsNameserver => ({ Name: dsNameserver })));
};

export const handler: CloudFormationCustomResourceHandler = customResourceHandler(createHandler, createHandler, noOpHandler);
