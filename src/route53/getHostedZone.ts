import { GetHostedZoneRequest, GetHostedZoneResponse, ResourceId } from "aws-sdk/clients/route53";
import * as aws from "aws-sdk";
import { prettyStringify } from "../util/prettyStringify";

const route53: aws.Route53 = new aws.Route53({ apiVersion: '2013-04-01', region: process.env.AWS_REGION });

export const getHostedZone = async (hostedZoneId: ResourceId): Promise<GetHostedZoneResponse> => {
    const request: GetHostedZoneRequest = {
        Id: hostedZoneId
    };
    console.log(`Will get hosted zone ${prettyStringify(request)}`);
    const response: GetHostedZoneResponse = await route53.getHostedZone(request).promise();
    console.log(`Did get hosted zone ${prettyStringify(response)}`);
    return response;
};
