import { CloudFormationCustomResourceHandler } from "aws-lambda";

export const noOpHandler: CloudFormationCustomResourceHandler = () => {
    console.log(`No-op cloud formation custom resource handler`);
};
