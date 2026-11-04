if(!window.NQ && window.jQuery) { window.NQ = window.jQuery; }
// This is the basic example of augmenting the validation functionality.  You
// can redefine the following functions:
//
// $get_validation(element) - returns the validation object
// $set_validation(element, data) - sets the validation settings on the element
//
// $init_validation(element,group, opts) will end up being called by the validation
// handler - in this case, src/handlers/validation/default_validation_handler.erl
//
// NOTE: It's extremely important that if your validation handler requires
// certain javascript files, that you ensure they are loaded before you try to
// work with that validation.  The example here loads the file:
// 
//     /nitrogen/livevalidation.min.js
//


class NitroVal {
    // Constructorclass Validator {
    constructor(element, group, opts) {
		this.element = element;
        this.group = group;
        this.attachTo = opts.attachTo ? opts.attachTo : element;
        this.validMessage = opts.validMessage;
        this.validateOnBlur = opts.validateOnBlur ? true : false;
        this.validateOnSubmit = opts.validateOnSubmit ? true : false;
        this.validations = [];
    }

    // Method to add a validation function with optional settings
    add(validationFun, opts = {}) {
        opts.fun = validationFun;
		console.log({adding_validation: opts});
        this.validations.push(opts);
    }

    // Method to validate the input based on added validations
    validate() {
        let hasError = false;
        let errorMsg = "";

        const value = Nitrogen.$get_value(this.element); // Fetch the current value of the element

        for (let i = 0; i < this.validations.length; i++) {
            const v = this.validations[i];
            const whenEmpty = v.when_empty;
			const validate = whenEmpty || value.length > 0;

			console.log({
				element: this.element,
				need_to_validate: validate,
				when_empty: whenEmpty
			});
            if (validate && !v.fun(value)) {
                hasError = true;
                errorMsg += v.msg;
            }
        }

        if (hasError) {
            Nitrogen.$validation_error(this.element, this.attachTo, errorMsg);
        }else{
			Nitrogen.$clear_validation_error(this.element, this.attachTo);
		}

        return !hasError;
    }
}

if(Nitrogen.$get_validation_system()!="nitrogen") {
	(function() {
		// Which HTML data field will the validators be stored in on the element
		Nitrogen.$validation_data_field = "nitrogen_validation_field";
		// The HTML class for the message that will show after the failed field message
		Nitrogen.$validation_message_class = "nitrogen_validation_message";
		// The Class to add to the target element when validation fails
		Nitrogen.$validation_failed_class = "nitrogen_validation_failed";

		NitrogenClass.prototype.$get_validation = function(element) {
			return NQ(element).data(this.$validation_data_field);
		};

		NitrogenClass.prototype.$set_validation = function(element, data) {
			return NQ(element).data(this.$validation_data_field, data);
		};

		NitrogenClass.prototype.$remove_validation_artifacts = function(element) {
			NQ(element).next("." + this.$validation_message_class).remove();
		};

		NitrogenClass.prototype.$init_validation = function(element, group, opts) {
			// If there is no element, we'll just return null;
			//console.log({init_validation: element});
			var n = this;
			if(NQ(element)) {
				// if the element doesn't have any validation, initialize the element for validation
				if(!(n.$get_validation(element))) {
					var v = new NitroVal(element, group, opts);
					n.$set_validation(element, v);
				}
				// Then return the validators connected to the element
				return n.$get_validation(element);
			}else{
				return null;
			}
		};

		NitrogenClass.prototype.$add_validation = function(element, update_v_fun) {
			var v = this.$get_validation(element);
			//console.log(v);
			v = update_v_fun(v);
			//console.log(v);
			this.$set_validation(element, v);
		};


		NitrogenClass.prototype.$validate_element = function(element, validationGroup) {
			//console.log({validating_group: validationGroup});
			var v = this.$get_validation(element);
			if(v && (validationGroup=="" || validationGroup==null || v.group==validationGroup)) {
				// This element has validation and the validation group matches, so
				// let's validate it and return the value of the validation (which
				// should be a boolean)
				return v.validate();
			}else{
				return true;
			}
		};

		NitrogenClass.prototype.$destroy_target_validation = function(element) {
			let v = this.$get_validation(element);
			if(v!=undefined) {
				var clear = this.$validation_click_or_focus_fun(element, v.attachTo);
				clear();
				this.$set_validation(element, null);
			}
		};

		NitrogenClass.prototype.$clear_validation_error = function(element, attachTo) {
			var f = this.$validation_click_or_focus_fun(element, attachTo);
			f();
		};

		NitrogenClass.prototype.$validation_click_or_focus_fun = function(element, attachTo) {
			return function() {
				Nitrogen.$remove_validation_artifacts(attachTo);
				NQ(element).removeClass(Nitrogen.$validation_failed_class);
			};
		};
		

		NitrogenClass.prototype.$validation_error = function(element, attachTo, html) {
			if(attachTo==null || attachTo==undefined) {
				attachTo=element;
			}

			let focus_fun = Nitrogen.$validation_click_or_focus_fun(element, attachTo);

			if(NQ(element).hasClass(this.$validation_failed_class)) {
				focus_fun();
			}

			NQ(element).on("focus", focus_fun);
			NQ(element).on("click", focus_fun);
				
			NQ(element)
				.addClass(this.$validation_failed_class);

			NQ("<span>")
				.addClass(this.$validation_message_class)
				.insertAfter(attachTo)
				.html(html)
		};

		Nitrogen.$set_validation_loaded("nitrogen");

	})();
}
