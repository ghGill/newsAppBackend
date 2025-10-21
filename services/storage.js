const { envVar } = require('./env');

let storage_class = null;

switch (envVar("STORAGE_TYPE")) {
    case 'AWS_S3':
        storage_class = require('./storage_aws_s3_presign_url')
        break;

    case 'AWS_S3_OLD':
        storage_class = require('./storage_aws_s3')
        break;

    case 'DISK':
        storage_class = require('./storage_disk')
        break;

}
const storage = new storage_class();

module.exports = storage
