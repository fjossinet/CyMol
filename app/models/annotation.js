var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var AnnotationSchema = new Schema({
    pdbID: String,
    chain: String,
    start: String,
    end: String,
    source: String, //URL to a webpage or an article 
    user: {

    },
    comment: String,
    created: Date,
    updated: Date
});

mongoose.model('Annotation', AnnotationSchema);