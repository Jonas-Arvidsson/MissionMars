let goForward = false,
	goBackwards = false,
	turnLeft = false,
	turnRight = false;

let socket = io.connect('http://192.168.43.50');

socket.on('update', function (data) {
	switch (data.direction) {
		case 'Up':
			goForward = data.pressed;
			break;
		case 'Down':
			goBackwards = data.pressed;
			break;
		case 'Left':
			turnLeft = data.pressed;
			break;
		case 'Right':
			turnRight = data.pressed;
			break;
	}
});

AFRAME.registerComponent("rover-controls", {

	init: function () {
		let world = document.querySelector("a-scene").systems.physics.driver.world;

		// Create materials
		var groundMaterial = new CANNON.Material("groundMaterial");
		var roverMaterial = new CANNON.Material("roverMaterial");

		var slipperyContactMaterial = new CANNON.ContactMaterial(groundMaterial, roverMaterial, {
			friction: 0.0,
			restitution: 0.3,
			contactEquationStiffness: 1e8,
			contactEquationRelaxation: 3
		});

		// The ContactMaterials must be added to the world
		world.addContactMaterial(slipperyContactMaterial);

		this.el.addEventListener("body-loaded", function (body) {
			// Apply materials to entity and ground
			this.body.material = roverMaterial;

			let ground = document.getElementById("ground");
			ground.body.material = groundMaterial;

			this.body.addEventListener("collide", function (e) {

				if (e.body.el.id === "landscape") {
					console.log("COLLISION DETECTED WITH LANDSCAPE!");
					roverHealth = roverHealth - 1;
				} else {
					console.log("COLLISION DETECTED! Body: ", e.body.el, " ID: ", e.body.el.id);
				}
			});

			let sand = document.querySelectorAll("#sand");
			for (i = 0; i < sand.length; i++) {
				sand[i].body.collisionResponse = false;
			}

			let rocks = document.querySelectorAll("#rocks");
			for (i = 0; i < rocks.length; i++) {
				rocks[i].body.collisionResponse = false;
			}

			requestAnimationFrame(gameLoop)
		});
	},
});

document.addEventListener('keydown', press)
function press(e) {
	if (e.keyCode === 38 /* up */ || e.keyCode === 87 /* w */ || e.keyCode === 90 /* z */)
		goForward = true;
	if (e.keyCode === 39 /* right */ || e.keyCode === 68 /* d */)
		turnRight = true;
	if (e.keyCode === 40 /* down */ || e.keyCode === 83 /* s */)
		goBackwards = true;
	if (e.keyCode === 37 /* left */ || e.keyCode === 65 /* a */ || e.keyCode === 81 /* q */)
		turnLeft = true;
}

document.addEventListener('keyup', release)
function release(e) {
	if (e.keyCode === 38 /* up */ || e.keyCode === 87 /* w */ || e.keyCode === 90 /* z */)
		goForward = false;
	if (e.keyCode === 39 /* right */ || e.keyCode === 68 /* d */)
		turnRight = false;
	if (e.keyCode === 40 /* down */ || e.keyCode === 83 /* s */)
		goBackwards = false;
	if (e.keyCode === 37 /* left */ || e.keyCode === 65 /* a */ || e.keyCode === 81 /* q */)
		turnLeft = false;
}

const localForward = new CANNON.Vec3(0, 0, -1);
const localUp = new CANNON.Vec3(0, 1, 0);
const linSpeed = 0.1;   // [units] / [s]
const angSpeed = 0.1;   // [units] / [s]
const maxLinSpeed = 2.65;  // [units] / [s]
const maxAngSpeed = 0.70;  // [units] / [s]

let roverHealth = 100;  // [hp]
let roverBattery = 100; // [bp]

let lastUpdate = Date.now();

function gameLoop() {

	// Update delta time
	const now = Date.now();
	const dt = now - lastUpdate;  // [ms]
	lastUpdate = now;

	// Retrieve rover physics body
	let roverBody = document.getElementById("rover").body;

	// Compute world delta vectors for linear and angualar velocities
	const localLinDelta = localForward.mult(linSpeed);
	const localAngDelta = localUp.mult(angSpeed);
	const worldLinDelta = roverBody.quaternion.vmult(localLinDelta);
	const worldAngDelta = roverBody.quaternion.vmult(localAngDelta);

	// If the battery is not dead, update the rover's velocities
	if (roverBattery > 0) {
		if (goForward) {
			roverBody.velocity.x += worldLinDelta.x;
			roverBody.velocity.y += worldLinDelta.y;
			roverBody.velocity.z += worldLinDelta.z;
		} else if (goBackwards) {
			roverBody.velocity.x -= worldLinDelta.x;
			roverBody.velocity.y -= worldLinDelta.y;
			roverBody.velocity.z -= worldLinDelta.z;
		} else if (turnLeft) {
			roverBody.angularVelocity.x += worldAngDelta.x;
			roverBody.angularVelocity.y += worldAngDelta.y;
			roverBody.angularVelocity.z += worldAngDelta.z;
		} else if (turnRight) {
			roverBody.angularVelocity.x -= worldAngDelta.x;
			roverBody.angularVelocity.y -= worldAngDelta.y;
			roverBody.angularVelocity.z -= worldAngDelta.z;
		}
	}

	// TODO: move to initialization
	roverBody.linearDamping = 0.9;
	roverBody.angularDamping = 0.9999;

	// Set initial health and battery drain factors
	let healthDrain = 0;    // [hp] / [s]
	let batteryDrain = 0.5;  // [bp] / [s]

	// Check if the rover is in contact with different materials
	let contacts = document.querySelector("a-scene").systems.physics.driver.world.contacts;
	for (i = 0; i < contacts.length; i++) {
		let contact = contacts[i].bi.el.id;
		if (contact === "sand") {
			batteryDrain = 3;
		}
		if (contact === "rocks") {
			healthDrain = 5;
		}
	}

	// Compute linear and angular speeds [units] / [s]
	const curLinSpeed = roverBody.velocity.length();
	const curAngSpeed = roverBody.angularVelocity.length();

	// Compute normalized factors [constant]
	const linFactor = Math.floor(curLinSpeed / maxLinSpeed * 100) / 100;
	const angFactor = Math.floor(curAngSpeed / maxAngSpeed * 100) / 100;

	// Drain health and battery
	roverHealth -= angFactor * healthDrain * dt / 1000;   // [hp]
	roverBattery -= linFactor * batteryDrain * dt / 1000;  // [bp]
	roverBattery -= 0.1 * dt / 1000;  // [bp]

	// Makes sure health and battery levels don't go below 0
	roverHealth = Math.max(roverHealth, 0);
	roverBattery = Math.max(roverBattery, 0);

	requestAnimationFrame(gameLoop)
}

window.setInterval(function () {
	socket.emit(
		'roverData',
		{
			health: roverHealth,
			battery: roverBattery
		}
	);
}, 50);
