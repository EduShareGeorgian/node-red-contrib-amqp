module.exports = {
    hooks: {
        readPackage(pkg) {
            if (pkg.name === '@edusharegeorgian/node-red-contrib-amqp') {
                pkg.dependencies = {
                    ...pkg.dependencies,
                    ...pkg.devDependencies,
                };
            }
            return pkg;
        },
    },
};