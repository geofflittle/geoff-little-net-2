import * as aws from "aws-sdk";
import { Bucket } from "aws-sdk/clients/s3";

const bucketName: string | undefined = process.argv[2];
if (!bucketName) {
    console.log("Must specify a bucket");
    process.exit(1);
}

const s3 = new aws.S3({ apiVersion: '2006-03-01' });
s3.headBucket({
    Bucket: bucketName
}).promise()
    .then(() => console.log("Bucket " + bucketName + " exists"))
    .catch(() => {
        console.log("Bucket " + bucketName + " does not exist, creating");
        return s3.createBucket({
            Bucket: bucketName
        }).promise()
            .then(() => console.log("Bucket " + bucketName + " created"))
            .catch((e) => {
                console.log("Error creating bucket " + bucketName);
                console.error(e);
            })
    });
