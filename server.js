var express = require('express'), 
    app = express(), 
    http = require('http'), 
    server = http.createServer(app), 
    io = require('socket.io').listen(server),
    LINQ = require('node-linq').LINQ,
    fs = require('fs'),
    locationGenerator = require('./location.js'),
    findInArray = require('./helper.js').findInArray,
    rooms = [],
    roomHosts = [],
    boxes = {}, 
    codes = {};

app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');
});

//load countries' bounding boxes and codes at server start
server.listen(8080, '192.168.4.1', () => {
    let host = server.address().address;
    let port = server.address().port;
    console.log('App listening at http://%s:%s', host, port);

    fs.readFile('./boxes.json', (err, data) => {
        if (err) throw err;
        boxes = JSON.parse(data);
    });

    fs.readFile('./codes.json', (err, data) => {
        if (err) throw err;
        codes = JSON.parse(data);
    });
});

var printRooms = () => {
    for (let i = 0; i < rooms.length; i++) {
        console.log('Room: ' + rooms[i].name);
        for (let j = 0; j < rooms[i].players.length; j++) {
            console.log('Player ' + j + ': ' + rooms[i].players[j].nickname);
        }
    }
    if (rooms.length == 0) {
        console.log('No rooms');
    }
};

io.sockets.on('connection', (client) => {
    console.log('connected');
    client.on('joinRoom', (joinInfo) => {
        let roomIndex = findInArray(rooms, 'name', joinInfo.room);
        let player = {
            nickname: joinInfo.nickname,
            clientRef: client
        };
        if (roomIndex > -1) { //room exists
            rooms[roomIndex].players.push(player); //add new player
            for (let i = 0; i < rooms[roomIndex].players.length; i++) {
                let clientRef = rooms[roomIndex].players[i].clientRef;
                clientRef.emit('playerJoined', new LINQ(rooms[roomIndex].players).Select((player) => {return player.nickname;}).ToArray()); //update player lists for all players
            }
        } else {
            let room = { //add new room
                name: joinInfo.room,
                players: [player]
            };
            rooms.push(room); //add new room
            roomHosts.push(player); //add host to hosts array
            client.emit('joinedRoom', new LINQ(room.players).Select((player) => {return player.nickname;}).ToArray());
            client.emit('nominateHost');
        }

        printRooms();
    });

    client.on('leaveRoom', (leaveInfo) => {
        let roomIndex = findInArray(rooms, 'name', leaveInfo.room);
        if (roomIndex > -1) { //room exists
            let playerIndex = findInArray(rooms[roomIndex].players, 'nickname', leaveInfo.nickname);
            rooms[roomIndex].players.splice(playerIndex, 1); //remove player
            if (rooms[roomIndex].players.length == 0) { //if no players in room - remove room
                rooms.splice(roomIndex, 1);
                roomHosts.splice(roomIndex, 1); //remove reference to room host in hosts array
            } else {
                for (let i = 0; i < rooms[roomIndex].players.length; i++) { //info for other players in room that someone left
                    let clientRef = rooms[roomIndex].players[i].clientRef;
                    clientRef.emit('playerLeft', new LINQ(rooms[roomIndex].players).Select((player) => {return player.nickname;}).ToArray());
                }
                
                if (playerIndex == 0) { //if player who joined first (host) leaves - nominate new host
                    rooms[roomIndex].players[0].clientRef.emit('nominateHost');
                    roomHosts[roomIndex] = rooms[roomIndex].players[0]; //change room host in hosts array
                }
            }
        } else {/*this shouldn't happen*/}

        printRooms();
    });

    client.on('startGame', (gameSettings) => {
        let hostIndex = findInArray(roomHosts, 'clientRef', client);
        let room = rooms[hostIndex];
        for (let i = 1; i < room.players.length; i++) {
            room.players[i].clientRef.emit('clientStartGame', gameSettings);
        }
    });

    client.on('loadLocations', (settings) => { 
        let numOfLocations = settings.numberOfRounds;
        let randomCountry = settings.randomCountry;
        let isSingleplayer = settings.isSingleplayer;
        let countriesInfo = {
            boxes: boxes,
            codes: codes
        };
        let clients = [client];

        let gameSettings = {
            numberOfLocations: numOfLocations
        };

        if (!isSingleplayer) {
            gameSettings.timerLimit = settings.timerLimit; //to pass timerLimit to all players besides host
            let hostIndex = findInArray(roomHosts, 'clientRef', client);
            let room = rooms[hostIndex];
            for (let i = 0; i < room.players.length; i++) { //push the rest of the players to clients array for emitting startMultiplayerGame event
                clients.push(room.players[i].clientRef);
            }
        }

        if (randomCountry) {
            gameSettings.countryCode = '';
            locationGenerator.getLocations(clients, countriesInfo, gameSettings);
        } else {
            gameSettings.countryCode = settings.countryCode;
            locationGenerator.getLocations(clients, countriesInfo, gameSettings);
        }
    });
});