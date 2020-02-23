import * as aws from "aws-sdk";
import {
    NameserverList,
    UpdateDomainNameserversRequest,
    UpdateDomainNameserversResponse
} from "aws-sdk/clients/route53domains";
import { prettyStringify } from "../util/prettyStringify";

const route53Domains: aws.Route53Domains = new aws.Route53Domains({ apiVersion: '2014-05-15', region: process.env.AWS_REGION });

export const updateDomainNameservers = async (domainName: string, nameserverList: NameserverList): Promise<UpdateDomainNameserversResponse> => {
    const request: UpdateDomainNameserversRequest = {
        DomainName: domainName,
        Nameservers: nameserverList
    };
    console.log(`Will update domain nameservers ${prettyStringify(request)}`);
    const response: UpdateDomainNameserversResponse = await route53Domains.updateDomainNameservers(request).promise();
    console.log(`Did update domain nameservers ${prettyStringify(response)}`);
    return response;
};
