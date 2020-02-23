import {
    CloudFormationCustomResourceEvent,
    CloudFormationCustomResourceFailedResponse,
    CloudFormationCustomResourceHandler,
    CloudFormationCustomResourceSuccessResponse,
    Context
} from "aws-lambda";
import * as https from "https";
import { parse as parseUrl } from 'url';
import * as aws from "aws-sdk";
import {
    CertificateSummary,
    DescribeCertificateResponse,
    ListCertificatesResponse, RequestCertificateRequest, RequestCertificateResponse,
    ResourceRecord
} from "aws-sdk/clients/acm";
import { isDefined } from "ts-is-present";
import {
    Change,
    ChangeResourceRecordSetsRequest,
    ChangeResourceRecordSetsResponse,
    HostedZone,
    ResourceId
} from "aws-sdk/clients/route53";
import { UpdateDomainNameserversRequest } from "aws-sdk/clients/route53domains";
import { prettyStringify } from "../util/prettyStringify";

const region = "us-east-2";
const acm = new aws.ACM({ apiVersion: "2015-12-08", region });
const route53 = new aws.Route53({ apiVersion: "2013-04-01", region });
const route53Domains = new aws.Route53Domains({ apiVersion: '2014-05-15', region });

const getSuccessResponse = (event: CloudFormationCustomResourceEvent): CloudFormationCustomResourceSuccessResponse => ({
    Status: 'SUCCESS',
    PhysicalResourceId: event.ResourceProperties.Key,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
});

const getErrorResponse = (e: Error,
                          event: CloudFormationCustomResourceEvent): CloudFormationCustomResourceFailedResponse => ({
    Status: 'FAILED',
    Reason: e.toString(),
    PhysicalResourceId: event.ResourceProperties.Key,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
});

const sendResponse = async (response: any, urlString: string): Promise<void> => {
    console.log("Sending response to " + urlString);
    const responseBody = JSON.stringify(response);
    const url = parseUrl(urlString);
    const options = {
        headers: {
            'Content-Type': '',
            'Content-Length': responseBody.length,
        },
        hostname: url.hostname,
        method: 'PUT',
        port: url.port || 443,
        path: url.path,
        rejectUnauthorized: true,
    };

    return new Promise<void>((resolve, reject) => {
        const request = https.request(options, (response) => {
            response.on('end', resolve);
        });
        request.on('error', reject);
        request.write(responseBody);
        request.end();
    });
};

const requestCert = async (acm: aws.ACM, certIn: ResourcePropertyCertificate): Promise<string> => {
    const requestCertificateRequest: RequestCertificateRequest = {
        DomainName: certIn.DomainName,
        ValidationMethod: "DNS",
        SubjectAlternativeNames: certIn.AlternativeNames,
        IdempotencyToken: certIn.DomainName.replace(/\W+/g, ""),
        Options: {
            CertificateTransparencyLoggingPreference: "ENABLED"
        }
    };
    console.log(`Will request certificate with request ${requestCertificateRequest}`);
    const requestCertificateResponse: RequestCertificateResponse = await acm.requestCertificate(
        requestCertificateRequest)
        .promise();
    console.log(`Did request certificate with response ${requestCertificateResponse}`);
    if (!requestCertificateResponse.CertificateArn) {
        throw new Error("Did not find certificate arn");
    }
    return requestCertificateResponse.CertificateArn;
};

const getCertArn = async (resourcePropertyCertificate: ResourcePropertyCertificate): Promise<string> => {
    console.log(`Will list certificates`);
    const listCertificatesResponse: ListCertificatesResponse = await acm.listCertificates().promise();
    console.log(`Did list certificates with response ${prettyStringify(listCertificatesResponse)}`);
    console.log(`Will find certificate arn for domain name ${resourcePropertyCertificate.DomainName}`);
    const summary: CertificateSummary | undefined = listCertificatesResponse.CertificateSummaryList
        ?.find(summary => summary.DomainName === resourcePropertyCertificate.DomainName);
    if (!summary || !summary.CertificateArn) {
        console.log(`Did not find certificate arn for domain name ${resourcePropertyCertificate.DomainName}`);
        return await requestCert(acm, resourcePropertyCertificate);
    }
    console.log(`Did find certificate arn for domain name ${resourcePropertyCertificate.DomainName}`);
    return summary.CertificateArn;
};

interface ResourcePropertyCertificate {
    HostedZone: ResourceId;
    DomainName: string;
    AlternativeNames: string[];
}

const sleep = async (val: any, ms: number) => {
    console.log(`Will sleep for ${ms} ms`);
    return await new Promise(resolve => setTimeout(() => {
        console.log(`Did sleep for ${ms} ms`);
        resolve(val);
    }, ms));
};

const getResourceRecords = async (certArn: string): Promise<ResourceRecord[]> => {
    let i = 0;
    do {
        console.log(`Will describe certificate ${certArn}`);
        const describeCertResponse: DescribeCertificateResponse = await acm.describeCertificate({
            CertificateArn: certArn
        }).promise();
        console.log(`Did describe certificate ${prettyStringify(describeCertResponse)}`);
        const resourceRecords: ResourceRecord[] | undefined = describeCertResponse.Certificate?.DomainValidationOptions
            ?.map(options => options.ResourceRecord)
            ?.filter(isDefined);
        if (resourceRecords && resourceRecords.length !== 0) {
            console.log(`Did find resource records ${prettyStringify(resourceRecords)}`);
            return resourceRecords;
        }
        console.log(`Did not find resource records`);
        i++;
    } while (i < 5 && await sleep(true, 1000));
    throw new Error("No resource records");
};

const handleEvent = async (event: CloudFormationCustomResourceEvent): Promise<void> => {
    const certificate: ResourcePropertyCertificate | undefined = event.ResourceProperties['Certificate'];
    if (!certificate) {
        throw new Error("No certificate resource property");
    }
    console.log(`Will get certificate arn for certificate resource property ${prettyStringify(certificate)}`);
    const certArn = await getCertArn(certificate);
    console.log(`Did get certificate arn ${certArn}`);
    console.log(`Will get resource records for certificate arn ${certArn}`);
    const resourceRecords: ResourceRecord[] = await getResourceRecords(certArn);
    console.log(`Did get resource records ${prettyStringify(resourceRecords)}`);
    const resourceRecordSetsChanges: Change[] = resourceRecords.map(resourceRecord => ({
        Action: event.RequestType,
        ResourceRecordSet: {
            Name: resourceRecord.Name,
            Type: resourceRecord.Type,
            TTL: 900,
            ResourceRecords: [{
                Value: resourceRecord.Value,
            }],
        }
    }));
    const changeResourceRecordSetsRequest: ChangeResourceRecordSetsRequest = {
        HostedZoneId: certificate.HostedZone,
        ChangeBatch: {
            Changes: resourceRecordSetsChanges
        }
    };
    console.log(`Will change resource record sets with request ${prettyStringify(changeResourceRecordSetsRequest)}`);
    const updateNameServersRequest: UpdateDomainNameserversRequest = {
        DomainName: certificate.DomainName,
        Nameservers: []
    };
    const response = await route53Domains.updateDomainNameservers(updateNameServersRequest);
    const changeResourceRecordSetsResponse: ChangeResourceRecordSetsResponse = await route53.changeResourceRecordSets(
        changeResourceRecordSetsRequest).promise();
    console.log(`Did change resource record sets with response ${prettyStringify(changeResourceRecordSetsResponse)}`);
};

export const handler: CloudFormationCustomResourceHandler =
    async (event: CloudFormationCustomResourceEvent, context: Context): Promise<void> => {
        console.log(`Invoked with event ${prettyStringify(event)}`);
        try {
            await handleEvent(event);
            await sendResponse(getSuccessResponse(event), event.ResponseURL);
        } catch (e) {
            await sendResponse(getErrorResponse(e, event), event.ResponseURL);
        }
        // return sendResponse(response, event.ResponseURL);
        // if (event.RequestType === 'Create') {
        //     console.log('RequestType Create');
        // }
        // if (event.RequestType === 'Update') {
        //     console.log('RequestType Update');
        // }
        // if (event.RequestType === 'Delete') {
        //     console.log('RequestType Update');
        // }
    };
