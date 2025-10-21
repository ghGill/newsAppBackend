class STORAGE_BASE {
    constructor() {
    }

    filePublicUrl(fileName, subFolder = null) {
    }
    
    movieFilePublicUrl(fileName, subFolder=null) {
    }

    async createFolder(params) {
    }

    async getFolderContent(params) {
    }

    async deleteFile(params) {
    }

    async deleteFolder(params) {
    }

    async getPresignUrl(req, res) {
        return({ success:true, url:'/files/upload', presign:false });
    }

    async uploadFile(req, res) {
    }
}

module.exports = STORAGE_BASE
