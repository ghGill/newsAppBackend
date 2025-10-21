const fs = require('fs/promises');
const STORAGE_BASE = require('./storage_base');
const { envVar } = require('./env');
const path = require('path');
const multer = require("multer");

class STORAGE_DISK extends STORAGE_BASE {
    constructor() {
        super();

        this.rootPath = envVar('DISK_ROOT_PATH');

        this.upload = multer({ storage: multer.memoryStorage() });
    }

    filePublicPath(filePath, subFolder = null) {
        if (subFolder)
            return path.join(this.rootPath, filePath, subFolder);
        else
            return path.join(this.rootPath, filePath);
    }

    movieFilePublicPath(filePath, subFolder = null) {
        return this.filePublicPath(envVar('MOVIES_FOLDER') + (subFolder ? '/' + subFolder : '') + '/' + filePath);
    }

    filePublicUrl(filePath) {
        return 'http://localhost:' + (String(envVar('APP_PORT')) + '/' + filePath).replaceAll('//', '/');
    }

    movieFilePublicUrl(fileName, subFolder = null) {
        return this.filePublicUrl(envVar('MOVIES_FOLDER') + (subFolder ? '/' + subFolder : '') + '/' + fileName);
    }

    async createFolder(params) {
        try {
            await fs.mkdir(this.filePublicPath(params.folderPath), { recursive: true });

            return { success: true };
        }
        catch (err) {
            return { success: false, message: err.message };
        }
    }

    async getFolderContent(params) {
        try {
            const data = await fs.readdir(this.filePublicPath(params.folderPath), { withFileTypes: true });

            const folderContent = data.filter(f => f.isFile()).map(item => item.name);

            return { success: true, files: folderContent };
        }
        catch (err) {
            return { success: false, message: err.message };
        }
    }

    async deleteFile(params) {
        try {
            await fs.unlink(this.filePublicPath(params.path, params.subFolder));

            return { success: true };
        }
        catch (err) {
            return { success: false, message: err.message };
        }
    }

    async deleteFolder(params) {
        try {
            await fs.rm(this.filePublicPath(params.path, params.subFolder), { recursive: true, force: true });

            return { success: true };
        }
        catch (err) {
            return { success: false, message: err.message };
        }
    }

    async uploadFile(req, res) {
        return new Promise((resolve, reject) => {
            this.upload.single('file')(req, res, async (e) => {
                if (e) {
                    return reject({ success: false, message: e.message });
                }

                const filePath = this.movieFilePublicPath(req.body.subFolder + '/' + req.file.originalname);
                await fs.writeFile(filePath, req.file.buffer);

                try {
                    return resolve({
                        success: true,
                        message: 'The file was uploaded successfully.',
                        url: this.movieFilePublicUrl(req.file.originalname, req.body.subFolder),
                        file_name: req.file.originalname,
                        subFolder:req.body.subFolder,
                        times:1,
                        deletable: true
                    })
                }
                catch (e) {
                    return reject({ success: false, message: e.message })
                }
            });
        })
    }
}

module.exports = STORAGE_DISK
