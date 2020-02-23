import {
    CloudFormationCustomResourceEvent, CloudFormationCustomResourceFailedResponse,
    CloudFormationCustomResourceHandler,
    CloudFormationCustomResourceSuccessResponse,
    Context
} from "aws-lambda";
import { parse as parseUrl, UrlWithStringQuery } from "url";
import * as https from "https";
import { prettyStringify } from "../util/prettyStringify";

const sendResponse = async (event: CloudFormationCustomResourceEvent,
                            e?: Error): Promise<void> => {
    const response: CloudFormationCustomResourceSuccessResponse | CloudFormationCustomResourceFailedResponse = {
        ...(e ? {
            Status: "FAILED",
            Reason: e.toString()
        } : {
            Status: "SUCCESS"
        }),
        PhysicalResourceId: event.ResourceProperties.Key,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
    };
    const responseBody = JSON.stringify(response);
    const url: UrlWithStringQuery = parseUrl(event.ResponseURL);
    const options = {
        headers: {
            "Content-Type": "",
            "Content-Length": responseBody.length,
        },
        hostname: url.hostname,
        method: "PUT",
        port: url.port || 443,
        path: url.path,
        rejectUnauthorized: true,
    };
    return new Promise<void>((resolve, reject) => {
        console.log(`Will make request ${prettyStringify(options)}`);
        const request = https.request(options, (response) => {
            response.on("end", () => {
                console.log(`Did make request`);
                resolve();
            });
        });
        request.on("error", reject);
        request.write(responseBody);
        request.end();
    });
};

export const customResourceHandler = (createHandler: CloudFormationCustomResourceHandler,
                                      updateHandler: CloudFormationCustomResourceHandler,
                                      deleteHandler: CloudFormationCustomResourceHandler): CloudFormationCustomResourceHandler =>
    async (event: CloudFormationCustomResourceEvent, context: Context, callback): Promise<void> => {
        try {
            switch (event.RequestType) {
                case "Create":
                    console.log(`Will create ${prettyStringify(event)}`);
                    await createHandler(event, context, callback);
                    console.log(`Did create ${prettyStringify(event)}`);
                    break;
                case "Update":
                    console.log(`Will update ${prettyStringify(event)}`);
                    await updateHandler(event, context, callback);
                    console.log(`Did update ${prettyStringify(event)}`);
                    break;
                case "Delete":
                    console.log(`Will delete ${prettyStringify(event)}`);
                    await deleteHandler(event, context, callback);
                    console.log(`Did delete ${prettyStringify(event)}`);
                    break;
            }
            await sendResponse(event);
        } catch (e) {
            await sendResponse(event, e);
        }
    };
