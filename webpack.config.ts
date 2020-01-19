import path from 'path';
import webpack from "webpack";

const config: webpack.Configuration =  {
    mode: "development",
    entry: "./src/acmDnsValidationLambda.ts",
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: "ts-loader",
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        extensions: [".ts", ".js"]
    },
    externals: {
    // FIXME: Exclude this for deploys
    //     "aws-sdk": "aws-sdk"
    },
    target: "node",
    output: {
        filename: 'acmDnsValidationLambda.js',
        libraryTarget: "commonjs2",
        path: path.resolve(__dirname, 'dist'),
    },
};

export default config;
