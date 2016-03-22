/**
A module giving access to several public databases (RFAM, NCBI, Ensembl,...)
@module db
**/

var db = exports,
    parsers = require('./parsers'),
    EventEmitter = require('events').EventEmitter
    exec = require('child_process'),
    path = require('path'),
    url = require('url');
    carrier = require('carrier'),
    fs = require('fs'),
    RNA = require('../core/molecules').RNA,
    rna = require('../rna.js');

db.PDB = function() {
    var self = this;

    this.getEntry = function(pdbId) {
        var options = {
                host: 'www.rcsb.org',
                port: 80,
                path: '/pdb/download/downloadFile.do?fileFormat=pdb&compression=NO&structureId='+pdbId
            },
            pdbContent = "";

        require('http').get(options, function(res) {
            res.on('data', function(data) {
                pdbContent = pdbContent.concat(data.toString());    
            }).on('end', function() {
                var pdbParser = new parsers.StringParser();
                pdbParser.on('end', function(tertiaryStructures) {
                    for (var i = 0 ; i < tertiaryStructures.length ; i++) {
                        tertiaryStructures[i].source = "db:pdb:"+pdbId;
                        tertiaryStructures[i].rna.source = "db:pdb:"+pdbId;  
                    }
                    self.emit('entry parsed',tertiaryStructures);
                });
                pdbParser.on('error', function(error) {
                    self.emit('error', pdbId+": "+error);
                });
                pdbParser.parsePDB(pdbContent);    
            });
        }).on('error', function(e) {
            console.log("Got error: " + e.message);
        });
    };

    this.getHeader = function(pdbId) {
        var options = {
                host: 'www.rcsb.org',
                port: 80,
                path: '/pdb/files/'+pdbId+'.pdb?headerOnly=YES'
            },
            headerData  = "",
            header= {'pdbId':pdbId};

        require('http').get(options, function(res) {
            res.on('data', function(data) {
                headerData  = headerData.concat(data.toString());    
            }).on('end', function() {
                var lines = headerData.split('\n'),
                    title = "",
                    authors = "",
                    date = "";
                for (var i = 0 ; i < lines.length ; i++) {
                    var line = lines[i];
                    if (line.substring(0,6).trim() == "HEADER") {
                        date = line.substring(50,59).trim()    
                    } else if (line.substring(0,6).trim() == "TITLE") {
                        title = title.concat(line.substring(10,70)).trim()+" ";
                    } else if (line.substring(0,6).trim() == "AUTHOR") {
                        authors = authors.concat(line.substring(10,70)).trim()+" ";
                    }
                }
                header['title'] = title.trim();
                header['date'] = date.trim();
                header['authors'] = authors.trim();
                self.emit('header parsed',header);
            });
        }).on('error', function(e) {
            console.log("Got error: " + e.message);
        });
    }

    this.query = function(query) {
        var minRes = query.minRes || null,
            maxRes = query.maxRes || null,
            minDate = query.minDate || null,
            maxDate = query.maxDate || null,
            keywords = query.keywords || [],
            authors = query.authors || [],
            pdbIds = query.pdbIds || [],
            titleContains = query.titleContains || [],
            containsRNA = query.containsRNA || '?',
            containsProtein = query.containsProtein || '?',
            containsDNA = query.containsDNA || '?',
            containsHybrid = query.containsHybrid || '?',
            experimentalMethod = query.experimentalMethod || null,
            post_data = '<orgPdbCompositeQuery version="1.0">',
            refinementLevel = 0,
            ids = "";

        if (maxRes != null || minRes != null) {
            if (refinementLevel > 0) {
                post_data = post_data.concat('<queryRefinement><queryRefinementLevel>'+refinementLevel+'</queryRefinementLevel><conjunctionType>and</conjunctionType>');
            } else {
                post_data = post_data.concat('<queryRefinement><queryRefinementLevel>'+refinementLevel+'</queryRefinementLevel>');   
            }
            post_data = post_data.concat('\
<orgPdbQuery>\
<version>head</version>\
<queryType>org.pdb.query.simple.ResolutionQuery</queryType>\
<description>Resolution query</description>\
<refine.ls_d_res_high.comparator>between</refine.ls_d_res_high.comparator>');
            if (minRes != null) {
                post_data = post_data.concat('\
<refine.ls_d_res_high.min>'+minRes+'</refine.ls_d_res_high.min>');                   
            }
            if (maxRes != null) {
                post_data = post_data.concat('\
<refine.ls_d_res_high.max>'+maxRes+'</refine.ls_d_res_high.max>');
            }
            post_data = post_data.concat('</orgPdbQuery></queryRefinement>');
            refinementLevel++;
        }

        if (maxDate != null || minDate != null) {
            if (refinementLevel > 0) {
                post_data = post_data.concat('<queryRefinement><queryRefinementLevel>'+refinementLevel+'</queryRefinementLevel><conjunctionType>and</conjunctionType>');
            } else {
                post_data = post_data.concat('<queryRefinement><queryRefinementLevel>'+refinementLevel+'</queryRefinementLevel>');   
            }
            post_data = post_data.concat('\
<orgPdbQuery>\
<version>head</version>\
<queryType>org.pdb.query.simple.ReleaseDateQuery</queryType>\
<description>Release Date query</description>\
<refine.ls_d_res_high.comparator>between</refine.ls_d_res_high.comparator>');
            if (minDate != null) {
                post_data = post_data.concat('\
<database_PDB_rev.date.min>'+minDate+'</database_PDB_rev.date.min>');                   
            }
            if (maxDate != null) {
                post_data = post_data.concat('\
<database_PDB_rev.date.max>'+maxDate+'</database_PDB_rev.date.max>');
            }
            post_data = post_data.concat('</orgPdbQuery></queryRefinement>');
            refinementLevel++;
        }

        for (var i = 0 ; i < titleContains.length ; i++) {
            var titleContain = titleContains[i];
            if (refinementLevel > 0) {
                post_data = post_data.concat('<queryRefinement><queryRefinementLevel>'+refinementLevel+'</queryRefinementLevel><conjunctionType>and</conjunctionType>');
            } else {
                post_data = post_data.concat('<queryRefinement><queryRefinementLevel>'+refinementLevel+'</queryRefinementLevel>');   
            }
            post_data = post_data.concat('\
<orgPdbQuery>\
<version>head</version>\
<queryType>org.pdb.query.simple.StructTitleQuery</queryType>\
<description>StructTitleQuery: struct.title.comparator=contains struct.title.value='+titleContain+'</description>\
<struct.title.comparator>contains</struct.title.comparator>\
<struct.title.value>'+titleContain+'</struct.title.value>\
</orgPdbQuery></queryRefinement>');
            refinementLevel++;
        }

        if (keywords.length != 0) {
            if (refinementLevel > 0) {
                post_data = post_data.concat('<queryRefinement><queryRefinementLevel>'+refinementLevel+'</queryRefinementLevel><conjunctionType>and</conjunctionType>');
            } else {
                post_data = post_data.concat('<queryRefinement><queryRefinementLevel>'+refinementLevel+'</queryRefinementLevel>');   
            }
            post_data = post_data.concat('\
<orgPdbQuery>\
<version>head</version>\
<queryType>org.pdb.query.simple.AdvancedKeywordQuery</queryType>\
<description>Text Search for: '+keywords.join(" ")+'</description>\
<keywords>'+keywords.join(" ")+'</keywords>\
</orgPdbQuery></queryRefinement>');
            refinementLevel++;
        }

        if (pdbIds.length != 0) {
            if (refinementLevel > 0) {
                post_data = post_data.concat('<queryRefinement><queryRefinementLevel>'+refinementLevel+'</queryRefinementLevel><conjunctionType>and</conjunctionType>');
            } else {
                post_data = post_data.concat('<queryRefinement><queryRefinementLevel>'+refinementLevel+'</queryRefinementLevel>');   
            }
            post_data = post_data.concat('\
<orgPdbQuery>\
<version>head</version>\
<queryType>org.pdb.query.simple.StructureIdQuery</queryType>\
<description>Simple query for a list of PDB IDs ('+pdbIds.length+' IDs) :'+pdbIds.join(", ")+'</description>\
<structureIdList>'+pdbIds.join(", ")+'</structureIdList>\
</orgPdbQuery></queryRefinement>');
            refinementLevel++;
        }

        if (experimentalMethod != null) {
            if (refinementLevel > 0) {
                post_data = post_data.concat('<queryRefinement><queryRefinementLevel>'+refinementLevel+'</queryRefinementLevel><conjunctionType>and</conjunctionType>');
            } else {
                post_data = post_data.concat('<queryRefinement><queryRefinementLevel>'+refinementLevel+'</queryRefinementLevel>');   
            }
            post_data = post_data.concat('\
<orgPdbQuery>\
<version>head</version>\
<queryType>org.pdb.query.simple.ExpTypeQuery</queryType>\
<description>Experimental Method is '+experimentalMethod+'</description>\
<mvStructure.expMethod.value>'+experimentalMethod+'</mvStructure.expMethod.value>\
</orgPdbQuery></queryRefinement>');
            refinementLevel++;
        }

        for (var i = 0 ; i < authors.length ; i++) {
            var author = authors[i];
            if (refinementLevel > 0) {
                post_data = post_data.concat('<queryRefinement><queryRefinementLevel>'+refinementLevel+'</queryRefinementLevel><conjunctionType>and</conjunctionType>');
            } else {
                post_data = post_data.concat('<queryRefinement><queryRefinementLevel>'+refinementLevel+'</queryRefinementLevel>');   
            }
            post_data = post_data.concat('\
<orgPdbQuery>\
<version>head</version>\
<queryType>org.pdb.query.simple.AdvancedAuthorQuery</queryType>\
<description>Author Search: Author Search: audit_author.name='+author+' OR (citation_author.name='+author+' AND citation_author.citation_id=primary)</description>\
<exactMatch>false</exactMatch>\
<audit_author.name>'+author+'</audit_author.name>\
</orgPdbQuery></queryRefinement>');
            refinementLevel++;
        }

        //chain type
        if (refinementLevel > 0) {
            post_data = post_data.concat('<queryRefinement><queryRefinementLevel>'+refinementLevel+'</queryRefinementLevel><conjunctionType>and</conjunctionType>');
        } else {
            post_data = post_data.concat('<queryRefinement><queryRefinementLevel>'+refinementLevel+'</queryRefinementLevel>');   
        }
        post_data = post_data.concat('\
<orgPdbQuery>\
<version>head</version>\
<queryType>org.pdb.query.simple.ChainTypeQuery</queryType>\
<description>Chain Type</description>\
<containsProtein>'+containsProtein+'</containsProtein>\
<containsDna>'+containsDNA+'</containsDna>\
<containsRna>'+containsRNA+'</containsRna>\
<containsHybrid>'+containsHybrid+'</containsHybrid>\
</orgPdbQuery></queryRefinement>');
        refinementLevel++;

        post_data = post_data.concat('</orgPdbCompositeQuery>');

        var options = {
                host: 'www.rcsb.org',
                port: 80,
                method: 'POST',
                path: '/pdb/rest/search',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': post_data.length
                }
            };

        var post_req = require('http').request(options, function(res) {
                res.setEncoding('utf8');
                res.on('data', function (data) {
                    ids = ids.concat(data);
                }).on('end', function() {
                    query["hits"] = ids.split('\n').slice(0,-1)
                    self.emit('end search',query);
                });
            });

        // post the data
        post_req.write(post_data);
        post_req.end();

    };
};

db.PDB.prototype.__proto__ = EventEmitter.prototype;

db.Eutils = function() {
    var self = this;
    this.options = {
        host: 'eutils.ncbi.nlm.nih.gov',
        port: 80
    };

    self.fetch = function(options) {
        var db = options.db,
            id = options.id,
            rettype = options.rettype || "asn1",
            retmode = options.retmode|| "text",
            content = "";

        if (db == null) {
           console.log('Entrez database is missing ("db" key in params).');
           return;  
        }

        if (id == null) {
           console.log('Entrez UIDs are missing ("id" key in params).');
           return;  
        }

        self.options.path = "/entrez/eutils/efetch.fcgi?db="+db+"&id="+id.join(',')+"&rettype="+rettype+"&retmode="+retmode;

        require('http').get(self.options, function(res) {
            res.on('data', function(data) {
                content += data;  
            }).on('end', function() {
                if (content.match(/Temporarily Unavailable/)) {
                    self.emit('error',"Service Temporarily Unavailable");
                }
                else if (rettype == "fasta") {
                    var parser = new parsers.StringParser();
                    parser.on("end", function(molecules) {
                        self.emit('end fetch',molecules);    
                    });
                    if (db == "nucleotide") {
                        parser.parseFasta(content,'DNA');
                    }
                }
                else if (rettype == "gb") {
                    var parser = new parsers.StringParser();
                    parser.on("end", function(data) {
                        if (!data.organism)
                            console.log(content); 
                        self.emit('end fetch',data);    
                    });
                    parser.parseGenbank(content);
                }
            });
        });

    };
};

db.Eutils.prototype.__proto__ = EventEmitter.prototype;

var args = process.argv.splice(2);
