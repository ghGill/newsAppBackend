const AWS = require('aws-sdk');
const STORAGE_BASE = require('./storage_base');
const { envVar } = require('./env');
const multer = require("multer");
const fs = require("fs");

class STORAGE_S3 extends STORAGE_BASE {
    constructor() {
        super();

        this.s3 = new AWS.S3({
            accessKeyId: envVar('AWS_ACCESS_KEY_ID'),
            secretAccessKey: envVar('AWS_SECRET_ACCESS_KEY'),
            region: envVar('AWS_REGION')
        });

        this.publicUrl = `https://${envVar('AWS_BUCKET')}.s3.${envVar('AWS_REGION')}.amazonaws.com`;

        // memory upload
        // this.upload = multer({ storage: multer.memoryStorage() });

        // disk upload
        this.upload = multer({ dest: "uploads/" });
    }

    filePublicUrl(filePath) {
        return this.publicUrl + ('/' + filePath).replaceAll('//', '/');
    }

    movieFilePublicUrl(fileName, subFolder = null) {
        return this.filePublicUrl(fileName);
    }

    getActionParams(params, extraData = {}) {
        let actionParams = {
            Bucket: params?.bucketName ? params.bucketName : envVar('AWS_BUCKET'),
        };

        return { ...actionParams, ...extraData };
    }

    async createFolder(params) {
        const actionParams = this.getActionParams(params, { Key: params.folderPath + '/', Body: '' });  // zero-byte object

        try {
            await this.s3.putObject(actionParams).promise();

            return { success: true };
        }
        catch (err) {
            return { success: false, message: err.message };
        }
    }

    async getFolderContent(params) {
        const actionParams = this.getActionParams(params, { Prefix: params.folderPath, Delimiter: '/' });  // Delimiter is optional, to get folder-like behavior

        try {
            const data = await this.s3.listObjectsV2(actionParams).promise();

            // data.Contents is an array of objects representing files
            const folderContent = data.Contents.map(item => item.Key);

            return { success: true, files: folderContent };
        }
        catch (err) {
            return { success: false, message: err.message };
        }
    }

    async deleteFile(params) {
        const actionParams = this.getActionParams(params, { Key: params.filePath });

        try {
            await this.s3.deleteObject(actionParams).promise();

            return { success: true };
        }
        catch (err) {
            return { success: false, message: err.message };
        }
    }

    // async uploadFileUsingMemory(req, res) {
    //     return new Promise((resolve, reject) => {
    //         this.upload.single('file')(req, res, async (e) => {
    //             if (e) {
    //                 return reject({ success: false, message: e.message });
    //             }

    //             try {
    //                 const params = {
    //                     Bucket: envVar('AWS_BUCKET'),
    //                     Key: envVar('MOVIES_FOLDER') + '/' + req.body.subFolder + '/' + req.file.originalname,
    //                     Body: req.file.buffer,
    //                     ContentType: req.file.mimetype
    //                 };

    //                 await this.s3.upload(params).promise();

    //                 return resolve({
    //                     success: true,
    //                     message: 'The file was uploaded successfully.',
    //                     url: this.filePublicUrl(params.Key),
    //                     file_name: req.file.originalname,
    //                     subFolder:req.body.subFolder,
    //                     times:1,
    //                     deletable: true
    //                 })
    //             }
    //             catch (e) {
    //                 return reject({ success: false, message: e.message })
    //             }
    //         });
    //     })
    // }

    async uploadFile(req, res) {
        return new Promise((resolve, reject) => {
            this.upload.single('file')(req, res, async (e) => {
                if (e) {
                    return reject({ success: false, message: e.message });
                }

                try {
                    const fileStream = fs.createReadStream(req.file.path);

                    const params = {
                        Bucket: envVar('AWS_BUCKET'),
                        Key: envVar('MOVIES_FOLDER') + '/' + req.body.subFolder + '/' + req.file.originalname,
                        // Body: req.file.buffer, : memory upload
                        Body: fileStream,
                        ContentType: req.file.mimetype
                    };

                    await this.s3.upload(params).promise();

                    return resolve({
                        success: true,
                        message: 'The file was uploaded successfully.',
                        url: this.filePublicUrl(params.Key),
                        file_name: req.file.originalname,
                        subFolder: req.body.subFolder,
                        times: 1,
                        deletable: true
                    })
                }
                catch (e) {
                    return reject({ success: false, message: e.message })
                }
                finally {
                    fs.unlink(req.file.path, (err) => {
                        if (err) {
                            console.error("Failed to remove file: " + req.file.path, err);
                        }
                    });
                }
            });
        })
    }
}

module.exports = STORAGE_S3
