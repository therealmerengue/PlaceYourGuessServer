module.exports = {
    findInArray: (array, propName, value) => {
        for (let i = 0; i < array.length; i++) {
            if (array[i][propName] === value) {
                return i;
            }
        }
        return -1;
    }
}