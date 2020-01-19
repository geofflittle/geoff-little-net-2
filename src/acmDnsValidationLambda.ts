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
    ListCertificatesResponse, RequestCertificateResponse,
    ResourceRecord
} from "aws-sdk/clients/acm";
import { isDefined } from "ts-is-present";

const acm = new aws.ACM({ apiVersion: "2015-12-08" });

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

interface Certificate {
    DomainName: string;
    HostedZone: object;
}

const requestCert = async (acm: aws.ACM, domainName: string): Promise<string> => {
    const requestCertResponse: RequestCertificateResponse = await acm.requestCertificate({
        DomainName: domainName,
        ValidationMethod: "DNS",
        SubjectAlternativeNames: ["www." + domainName],
        IdempotencyToken: domainName,
        Options: {
            CertificateTransparencyLoggingPreference: "ENABLED"
        }
    }).promise();
    if (!requestCertResponse.CertificateArn) {
        throw new Error("Empty cert arn in RequestCert response from Acm");
    }
    return requestCertResponse.CertificateArn;
};

const getCertArn = async (domainName: string): Promise<string> => {
    const listCertsResponse: ListCertificatesResponse = await acm.listCertificates().promise();
    const summary: CertificateSummary | undefined = listCertsResponse.CertificateSummaryList
        ?.find(summary => summary.DomainName === domainName);
    if (!summary || !summary.CertificateArn) {
        console.log("No acm certs");
        return await requestCert(acm, domainName);
    }
    return summary.CertificateArn;
};

const getResponse = async (event: CloudFormationCustomResourceEvent): Promise<void> => {
    const certificate: { [key: string]: string } | undefined = event.ResourceProperties['Certificate'];
    if (!certificate) {
        throw new Error("No cert provided");
    }
    console.log(`From custom resource props, got cert ${certificate.toString()}`);
    const certArn = await getCertArn(certificate["DomainName"]);
    console.log(`From acm, got cert ${certArn}`);
    certificate.map(async certificate => {
        const summary: CertificateSummary | undefined = summaries.find(
            summary => summary.DomainName && summary.DomainName === certificate["DomainName"]);
        if (!summary || !summary.CertificateArn) {
            throw new Error(`No matching acm cert for provided cert ${certificate.toString()}`);
        }
        const describeCertResponse: DescribeCertificateResponse = await acm.describeCertificate(
            { CertificateArn: summary.CertificateArn }).promise();
        const resourceRecords: (ResourceRecord)[] | undefined = describeCertResponse.Certificate?.DomainValidationOptions
            ?.map(options => options.ResourceRecord)
            ?.filter(isDefined);
        if (!resourceRecords || resourceRecords.length === 0) {
            throw new Error("No resource records");
        }
        const batch = resourceRecords.map(resourceRecord => ({
            // Parameterize
            Action: "UPSERT",
            ResourceRecordSet: {
                Name: resourceRecord.Value,
                Type: resourceRecord.Value,
                TTL: 900,
                ResourceRecords: [{
                    Value: resourceRecord.Value,
                }],
            }
        }));
        const obj = {
          [certificate["HostedZone"]]: batch
        };
        console.log("this is some obj", obj);
    });
};

export const handler: CloudFormationCustomResourceHandler =
    async (event: CloudFormationCustomResourceEvent, context: Context): Promise<void> => {
        console.log("Invoked with event", event.toString());
        const response = await getResponse(event);
        return sendResponse(response, event.ResponseURL);
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
