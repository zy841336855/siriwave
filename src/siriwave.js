import Curve from './curve';
import iOS9Curve from './ios9curve';
import raf from 'raf';

export default class SiriWave {

	/**
	 * Build the SiriWave
	 * @param {Object} opt 
	 * @param {DOMElement} [opt.container=document.body] The DOM container where the DOM canvas element will be added
	 * @param {String} [opt.style='ios'] The style of the wave: `ios` or `ios9`
	 * @param {Number} [opt.ratio=null] Ratio of the display to use. Calculated by default.
	 * @param {Number} [opt.speed=0.2] The speed of the animation.
	 * @param {Number} [opt.amplitude=1] The amplitude of the complete wave.
	 * @param {Number} [opt.frequency=6] The frequency for the complete wave (how many waves). - Not available in iOS9 Style
	 * @param {String} [opt.color='#fff'] The color of the wave, in hexadecimal form (`#336699`, `#FF0`). - Not available in iOS9 Style
	 * @param {Number} [opt.speedInterpolationSpeed=0.005] The increment to add when interpolating the speed property.
	 * @param {Number} [opt.speedInterpolationSpeed=0.005] The increment to add when interpolating the amplitude property.
	 * @param {Boolean} [opt.cover=false] The `canvas` covers the entire width or height of the container.
	 * @param {Number} [opt.width=null] Width of the canvas. Calculated by default.
	 * @param {Number} [opt.height=null] Height of the canvas. Calculated by default.
	 * @param {Boolean} [opt.autostart=false] Decide wether start the animation on boot.
	 * @param {Number} [opt.pixelDepth=0.01] Number of step (in pixels) used when drawed on canvas.
	 */
	constructor(opt = {}) {
		this.container = opt.container || document.body;

		// In this.opt you could find definitive opt with defaults values
		this.opt = Object.assign({
			style: 'ios',
			ratio: (window.devicePixelRatio || 1),
			speed: 0.1,
			amplitude: 1,
			frequency: 6,
			color: '#fff',
			speedInterpolationSpeed: 0.005,
			amplitudeInterpolationSpeed: 0.005,
			cover: false,
			width: window.getComputedStyle(this.container).width.replace('px', ''),
			height: window.getComputedStyle(this.container).height.replace('px', ''),
			autostart: false,
			pixelDepth: 0.01
		}, opt);

		/**
		 * Max X coordinate to draw the graph
		 */
		this.MAX_X = 2;

		/**
		 * A really small value to consider a wave "dead" (used in iOS9)
		 */
		this.DEAD_THRESHOLD = 0.001;

		/**
		 * Phase of the wave (passed to Math.sin function)
		 */
		this.phase = 0;

		/**
		 * Boolean value indicating the the animation is running
		 */
		this.run = false;

		/**
		 * Actual speed of the animation. Is not safe to change this value directly, use `setSpeed` instead.
		 */
		this.speed = Number(this.opt.speed);

		/**
		 * Actual amplitude of the animation. Is not safe to change this value directly, use `setAmplitude` instead.
		 */
		this.amplitude = Number(this.opt.amplitude);

		/**
		 * Width of the canvas multiplied by pixel ratio
		 */
		this.width = Number(this.opt.ratio * this.opt.width);

		/**
		 * Height of the canvas multiplied by pixel ratio
		 */
		this.height = Number(this.opt.ratio * this.opt.height);

		/**
		 * Maximum height for a single wave
		 */
		this.heightMax = Number(this.height / 2) - 4;

		/**
		 * Color of the wave (used in Classic iOS)
		 */
		this.color = this._hex2rgb(this.opt.color);

		/**
		 * An object containing controller variables that need to be interpolated 
		 * to an another value before to be actually changed
		 */
		this.interpolation = {
			speed: this.speed,
			amplitude: this.amplitude
		};

		/**
		 * Canvas DOM Element where curves will be drawn
		 */
		this.canvas = document.createElement('canvas');

		/**
		 * 2D Context from Canvas
		 */
		this.ctx = this.canvas.getContext('2d');

		// Set dimensions
		this.canvas.width = this.width;
		this.canvas.height = this.height;

		// By covering, we ensure the canvas is in the same size of the parent
		if (this.opt.cover === true) {
			this.canvas.style.width = this.canvas.style.height = '100%';
		} else {
			this.canvas.style.width = (this.width / this.opt.ratio) + 'px';
			this.canvas.style.height = (this.height / this.opt.ratio) + 'px';
		}

		/**
		 * Curves objects to animate
		 */
		this.curves = [];

		// Instantiate all curves based on the style
		if (this.opt.style === 'ios9') {
			const numberOfCurvesPerDef = ((3 * Math.random()) | 0);
			for (let def of iOS9Curve.getDefinition()) {
				for (let j = 0; j < numberOfCurvesPerDef; j++) {
					this.curves.push(new iOS9Curve({
						ctrl: this,
						definition: def
					}));
				}
			}
		} else {
			for (let def of Curve.getDefinition()) {
				this.curves.push(new Curve({
					ctrl: this,
					definition: def
				}));
			}
		}

		// Attach to the container
		this.container.appendChild(this.canvas);

		// Start the animation
		if (opt.autostart) {
			this.start();
		}
	}

	/**
	 * Convert an HEX color to RGB
	 * @param {String} hex
	 * @returns RGB value that could be used
	 * @memberof SiriWave
	 */
	_hex2rgb(hex) {
		let shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
		hex = hex.replace(shorthandRegex, function (m, r, g, b) {
			return r + r + g + g + b + b;
		});
		let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result ?
			parseInt(result[1], 16).toString() + ',' + parseInt(result[2], 16).toString() + ',' + parseInt(result[3], 16).toString() :
			null;
	}

	/**
	 * Interpolate a property to the value found in $.interpolation
	 * @param {String} propertyStr
	 * @returns
	 * @memberof SiriWave
	 */
	_interpolate(propertyStr) {
		// This is how much we have to add in every iteration
		let increment = this.opt[propertyStr + 'InterpolationSpeed'];
		if (increment == null) {
			throw new Error('Unable to retrieve increment for: ' + propertyStr);
		}

		// We reached the end
		if (Math.abs(this.interpolation[propertyStr] - this[propertyStr]) <= increment) {
			this[propertyStr] = this.interpolation[propertyStr];
			return;
		}

		// Add or subtract the property for the increment
		if (this.interpolation[propertyStr] > this[propertyStr]) {
			this[propertyStr] += increment;
		} else {
			this[propertyStr] -= increment;
		}

		return this[propertyStr];
	}

	/**
	 * Clear the canvas
	 * @memberof SiriWave
	 */
	_clear() {
		this.ctx.globalCompositeOperation = 'destination-out';
		this.ctx.fillRect(0, 0, this.width, this.height);
		this.ctx.globalCompositeOperation = 'source-over';
	}

	/**
	 * Draw all curves
	 * @memberof SiriWave
	 */
	_draw() {
		for (let curve of this.curves) {
			curve.draw();
		}
	}

	/**
	 * Clear the space, interpolate values, calculate new steps and draws
	 * @returns
	 * @memberof SiriWave
	 */
	_startDrawCycle() {
		if (this.run === false) return;
		this._clear();

		// Interpolate values
		this._interpolate('amplitude');
		this._interpolate('speed');

		this._draw();
		this.phase = (this.phase + Math.PI * this.opt.speed) % (2 * Math.PI);

		raf(this._startDrawCycle.bind(this), 20);
	}

	/* API */

	/**
	 * Start the animation
	 * @memberof SiriWave
	 */
	start() {
		this.phase = 0;
		this.run = true;
		this._startDrawCycle();
	}

	/**
	 * Stop the animation
	 * @memberof SiriWave
	 */
	stop() {
		this.phase = 0;
		this.run = false;
	}

	/**
	 * Set a new value for the speed property (interpolated)
	 * @param {Number} v
	 * @memberof SiriWave
	 */
	setSpeed(v) {
		this.interpolation.speed = v;
	}

	/**
	 * Set a new value for the amplitude property (interpolated)
	 * @param {Number} v
	 * @memberof SiriWave
	 */
	setAmplitude(v) {
		this.interpolation.amplitude = Math.max(Math.min(v, 1), 0);
	}
}