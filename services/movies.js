const fs = require('fs/promises');
const { envVar } = require('../services/env');
const storage = require('../services/storage');

getMoviesFolder = function (subFolder = null) {
    const moviesFolder = envVar('MOVIES_FOLDER');

    return `${moviesFolder}/${subFolder ? subFolder + '/' : ''}`;
}

createUserMoviesFolder = async function (userId) {
    const folderPath = getMoviesFolder(userId);

    await storage.createFolder({ folderPath: folderPath });
}

getFolderMoviesList = async function (subFolder = null) {
    try {
        const moviesFolderPath = getMoviesFolder(subFolder);

        const folderContent = await storage.getFolderContent({ folderPath: moviesFolderPath });

        let files = []
        const validExt = envVar("MOVIES_EXT").split(",");

        if (folderContent.success) {
            folderContent.files.forEach(f => {
                const fileName = f.split('/').pop();  // get the last splited item
                const fileExt = fileName.split('.').pop();

                if (fileName !== fileExt) {
                    if (validExt.includes(fileExt))
                        files.push(
                            {
                                name: fileName,
                                url: storage.movieFilePublicUrl(f, subFolder),
                                subFolder: subFolder,
                                deletable: (subFolder !== null)
                            }
                        );
                }
            })
        }

        return files;
    }
    catch (e) {
        console.log(e.message);

        return [];
    }
}

getMoviesList = async function (userId) {
    let commonMovies = await this.getFolderMoviesList();

    let userMovies = await getFolderMoviesList(userId);

    return [...commonMovies, ...userMovies];
}

deleteMovieFile = async function (fileName, subFolder) {
    try {
        const filePath = getMoviesFolder(subFolder) + fileName;

        await storage.deleteFile({path: filePath});

        return { success: true };
    }
    catch (e) {
        return { success: false, message: e.message };
    }
}

deleteUserMoviesFolder = async function (subFolder) {
    try {
        const folderPath = getMoviesFolder(subFolder);

        await storage.deleteFolder({path: folderPath});

        return { success: true };
    }
    catch (e) {
        return { success: false, message: e.message };
    }
}

module.exports = {
    getMoviesFolder,
    createUserMoviesFolder,
    getMoviesList,
    deleteMovieFile,
    deleteUserMoviesFolder
}
