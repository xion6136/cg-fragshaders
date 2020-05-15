class GlApp {
    constructor(canvas_id, width, height, video) {
        // initialize <canvas> with a WebGL 2 context
        this.canvas = document.getElementById(canvas_id);
        this.canvas.width = width;
        this.canvas.height = height;
        this.gl = this.canvas.getContext('webgl2');
        if (!this.gl) {
            alert('Unable to initialize WebGL 2. Your browser may not support it.');
        }

        // initialize local data members
        this.shader = {                                   // Each shader object will contain the GPU program
            normal: null,                                 // (vertex shader + fragment shader) and its
            black_white: null,                            // corresponding uniform variables
            fish_eye: null,
            shockwave: null,
            toon: null,
            edge: null
        };

        this.vertex_position_attrib = 0;                  // vertex attribute 0: 3D position
        this.vertex_texcoord_attrib = 1;                  // vertex attribute 1: 2D texture coordinates

        this.projection_matrix = glMatrix.mat4.create();  // projection matrix (on CPU)
        this.view_matrix = glMatrix.mat4.create();        // view matrix (on CPU)
        this.model_matrix = glMatrix.mat4.create();       // model matrix (on CPU)

        this.plane_vao = null;                            // plane Vertex Array Object (contains all attributes
                                                          // of the model - vertices, texcoords, faces, ...)

        this.video = video;                               // video element
        this.has_video = false;                           // flag - whether video is playing yet or not
        this.video_texture = null;                        // texture for video

        this.filter = 'normal';                           // current shading algorithm to use for rendering

        this.start_time = performance.now();              // start time of app


        // download and compile shaders into GPU program
        let normal_vs = this.GetFile('shaders/normal.vert');
        let normal_fs = this.GetFile('shaders/normal.frag');
        let black_white_vs = this.GetFile('shaders/black_white.vert');
        let black_white_fs = this.GetFile('shaders/black_white.frag');
        let fish_eye_vs = this.GetFile('shaders/fish_eye.vert');
        let fish_eye_fs = this.GetFile('shaders/fish_eye.frag');
        let shockwave_vs = this.GetFile('shaders/shockwave.vert');
        let shockwave_fs = this.GetFile('shaders/shockwave.frag');
        let toon_vs = this.GetFile('shaders/toon.vert');
        let toon_fs = this.GetFile('shaders/toon.frag');
        let edge_vs = this.GetFile('shaders/edge.vert');
        let edge_fs = this.GetFile('shaders/edge.frag');

        Promise.all([normal_vs, normal_fs, black_white_vs, black_white_fs,
                     fish_eye_vs, fish_eye_fs, shockwave_vs, shockwave_fs,
                     toon_vs, toon_fs, edge_vs, edge_fs])
        .then((shaders) => this.LoadAllShaders(shaders))
        .catch((error) => this.GetFileError(error));
    }

    InitializeGlApp() {
        // set drawing area to be the entire framebuffer
        this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
        // set the background color to black
        this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        // enable z-buffer for visible surface determination
        this.gl.enable(this.gl.DEPTH_TEST);

        // create plane model
        this.plane_vao = this.CreatePlaneVao();

        // initialize texture
        this.InitializeTexture();

        // render scene
        window.requestAnimationFrame((timestamp) => { this.Animate(timestamp) });
    }

    CreatePlaneVao() {
        // create a new Vertex Array Object
        let vertex_array = this.gl.createVertexArray();
        // set newly created Vertex Array Object as the active one we are modifying
        this.gl.bindVertexArray(vertex_array);

        
        // create buffer to store vertex positions (3D points)
        let vertex_position_buffer = this.gl.createBuffer();
        // set newly created buffer as the active one we are modifying
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertex_position_buffer);
        // create array of 3D vertex values (each set of 3 values specifies a vertex: x, y, z)
        let vertices = [
            -1.0, -1.0,  0.0,
             1.0, -1.0,  0.0,
             1.0,  1.0,  0.0,
            -1.0,  1.0,  0.0
        ];
        // store array of vertex positions in the vertex_position_buffer
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);
        // enable position_attrib in our GPU program
        this.gl.enableVertexAttribArray(this.vertex_position_attrib);
        // attach vertex_position_buffer to the position_attrib
        // (as 3-component floating point values)
        this.gl.vertexAttribPointer(this.vertex_position_attrib, 3, this.gl.FLOAT, false, 0, 0);


        // create buffer to store texture coordinate (2D coordinates for mapping images to the surface)
        let vertex_texcoord_buffer = this.gl.createBuffer();
        // set newly created buffer as the active one we are modifying
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertex_texcoord_buffer);
        // create array of 2D texture coordinate values (each set of 2 values specifies texture coordinate: u, v)
        let texcoords = [
            1.0,  1.0,
            0.0,  1.0,
            0.0,  0.0,
            1.0,  0.0
        ];
        // store array of vertex texture coordinates in the vertex_texcoord_buffer
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(texcoords), this.gl.STATIC_DRAW);
        // enable texcoord_attrib in our GPU program
        this.gl.enableVertexAttribArray(this.vertex_texcoord_attrib);
        // attach vertex_texcoord_buffer to the texcoord_attrib
        // (as 2-component floating point values)
        this.gl.vertexAttribPointer(this.vertex_texcoord_attrib, 2, this.gl.FLOAT, false, 0, 0);

        
        // create buffer to store faces of the triangle
        let vertex_index_buffer = this.gl.createBuffer();
        // set newly created buffer as the active one we are modifying
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, vertex_index_buffer);
        // create array of vertex indices (each set of 3 represents a triangle)
        let indices = [
             0,  1,  2,      0,  2,  3,
        ];
        // store array of vertex indices in the vertex_index_buffer
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), this.gl.STATIC_DRAW);


        // no longer modifying our Vertex Array Object, so deselect
        this.gl.bindVertexArray(null);


        // store the number of vertices used for entire model (number of faces * 3)
        vertex_array.face_index_count = indices.length;


        // return created Vertex Array Object
        return vertex_array;
    }

    InitializeTexture() {
        // create a texture, and upload a temporary 1px white RGBA array [255,255,255,255]
        this.video_texture = this.gl.createTexture();

        this.gl.bindTexture(this.gl.TEXTURE_2D, this.video_texture);

        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

        let pixels = [255, 255, 255, 255,    0,   0,   0, 255,  255, 255, 255, 255,
                        0,   0,   0, 255,  255, 255, 255, 255,    0,   0,   0, 255];
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 3, 2, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, new Uint8Array(pixels));

        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    }

    UpdateTexture() {
        // update texture from video
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.video_texture);

        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.video);

        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    }

    SetFilter(filter) {
        this.filter = filter;
    }

    Animate(timestamp) {
        let time = timestamp - this.start_time;

        if (this.has_video) {
            this.UpdateTexture();
        }
        this.Render(time);

        window.requestAnimationFrame((timestamp) => { this.Animate(timestamp) });
    }

    Render(time) {
        // delete previous frame (reset both framebuffer and z-buffer)
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        
        // render plane with texture
        let shader = this.shader[this.filter];
        this.gl.useProgram(shader.program);

        this.gl.uniformMatrix4fv(shader.uniform.projection_matrix, false, this.projection_matrix);
        this.gl.uniformMatrix4fv(shader.uniform.view_matrix, false, this.view_matrix);
        this.gl.uniformMatrix4fv(shader.uniform.model_matrix, false, this.model_matrix);

        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.video_texture);
        this.gl.uniform1i(shader.uniform.image, 0);


        this.gl.bindVertexArray(this.plane_vao);
        this.gl.drawElements(this.gl.TRIANGLES, this.plane_vao.face_index_count, this.gl.UNSIGNED_SHORT, 0);
        this.gl.bindVertexArray(null);
    }

    GetFile(url) {
        return new Promise((resolve, reject) => {
            let req = new XMLHttpRequest();
            req.onreadystatechange = function() {
                if (req.readyState === 4 && req.status === 200) {
                    resolve(req.response);
                }
                else if (req.readyState === 4) {
                    reject({url: req.responseURL, status: req.status});
                }
            };
            req.open('GET', url, true);
            req.send();
        });
    }

    GetFileError(error) {
        console.log('Error:', error);
    }

    LoadAllShaders(shaders) {
        this.LoadShader(shaders[ 0], shaders[ 1], 'normal');
        this.LoadShader(shaders[ 2], shaders[ 3], 'black_white');
        this.LoadShader(shaders[ 4], shaders[ 5], 'fish_eye');
        this.LoadShader(shaders[ 6], shaders[ 7], 'shockwave');
        this.LoadShader(shaders[ 8], shaders[ 9], 'toon');
        this.LoadShader(shaders[10], shaders[11], 'edge');

        this.InitializeGlApp();
    }

    LoadShader(vert_source, frag_source, program_name, has_texture) {
        // compile vetex shader
        let vertex_shader = this.CompileShader(vert_source, this.gl.VERTEX_SHADER);
        // compile fragment shader
        let fragment_shader = this.CompileShader(frag_source, this.gl.FRAGMENT_SHADER);

        // create GPU program from the compiled vertex and fragment shaders
        let program = this.CreateShaderProgram(vertex_shader, fragment_shader);

        // specify input and output attributes for the GPU program
        this.gl.bindAttribLocation(program, this.vertex_position_attrib, "vertex_position");
        this.gl.bindAttribLocation(program, this.vertex_normal_attrib, "vertex_normal");
        this.gl.bindAttribLocation(program, this.vertex_texcoord_attrib, 'vertex_texcoord');
        this.gl.bindAttribLocation(program, 0, "FragColor");

        // link compiled GPU program
        this.LinkShaderProgram(program);

        // get handles to uniform variables defined in the shaders
        let num_uniforms = this.gl.getProgramParameter(program, this.gl.ACTIVE_UNIFORMS);
        let uniform = {};
        let i;
        for (i = 0; i < num_uniforms; i++) {
            let info = this.gl.getActiveUniform(program, i);
            uniform[info.name] = this.gl.getUniformLocation(program, info.name);
        }

        this.shader[program_name] = {
            program: program,
            uniform: uniform
        }
    }

    CompileShader(source, type) {
        // create a shader object
        let shader = this.gl.createShader(type);

        // send the source to the shader object
        this.gl.shaderSource(shader, source);

        // compile the shader program
        this.gl.compileShader(shader);

        // check to see if it compiled successfully
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            alert("An error occurred compiling the shader: " + this.gl.getShaderInfoLog(shader));
        }

        return shader;
    }

    CreateShaderProgram(vertex_shader, fragment_shader) {
        // create a GPU program
        let program = this.gl.createProgram();
        
        // attach the vertex and fragment shaders to that program
        this.gl.attachShader(program, vertex_shader);
        this.gl.attachShader(program, fragment_shader);

        // return the program
        return program;
    }

    LinkShaderProgram(program) {
        // link GPU program
        this.gl.linkProgram(program);

        // check to see if it linked successfully
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            alert("An error occurred linking the shader program.");
        }
    }
}
