const AWS = require('aws-sdk');
const STORAGE_S3 = require('./storage_aws_s3');
const { envVar } = require('./env');

class STORAGE_S3_PRESIGN extends STORAGE_S3 {
    constructor() {
        super();
    }

    async getPresignUrl(req, res) {
        const params = {
            Bucket: envVar('AWS_BUCKET'),
            Key: envVar('MOVIES_FOLDER') + '/' + req.body.subFolder + '/' + req.body.fileName,
            Expires: 120, // URL valid for 120 seconds
            ContentType: req.body.fileType,
        };

        const uploadURL = this.s3.getSignedUrl("putObject", params);

        return({ success:true, url:uploadURL, presign:true });
    }
}

module.exports = STORAGE_S3_PRESIGN
