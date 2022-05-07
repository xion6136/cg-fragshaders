const {mat4, vec2, vec3} = glMatrix;

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
            ripple: null,
            toon: null,
            custom: null
        };

        this.vertex_position_attrib = 0;                  // vertex attribute 0: 3D position
        this.vertex_texcoord_attrib = 1;                  // vertex attribute 1: 2D texture coordinates

        this.projection_matrix = mat4.create();           // projection matrix (on CPU)
        this.view_matrix = mat4.create();                 // view matrix (on CPU)
        this.model_matrix = mat4.create();                // model matrix (on CPU)

        this.plane = null;                                // plane Vertex Array Object (contains all attributes
                                                          // of the model - vertices, texcoords, faces, ...)

        this.video = video;                               // video element
        this.has_video = false;                           // flag - whether video is playing yet or not
        this.video_texture = null;                        // texture for video

        this.filter = 'normal';                           // current shading algorithm to use for rendering

        this.start_time = performance.now();              // start time of app


        // download and compile shaders into GPU program
        let normal_vs = this.getFile('shaders/normal.vert');
        let normal_fs = this.getFile('shaders/normal.frag');
        let black_white_vs = this.getFile('shaders/black_white.vert');
        let black_white_fs = this.getFile('shaders/solution/black_white.frag');
        let fish_eye_vs = this.getFile('shaders/fish_eye.vert');
        let fish_eye_fs = this.getFile('shaders/solution/fish_eye.frag');
        let ripple_vs = this.getFile('shaders/ripple.vert');
        let ripple_fs = this.getFile('shaders/solution/ripple.frag');
        let toon_vs = this.getFile('shaders/toon.vert');
        let toon_fs = this.getFile('shaders/solution/toon.frag');
        let custom_vs = this.getFile('shaders/custom.vert');
        let custom_fs = this.getFile('shaders/solution/custom.frag');

        Promise.all([normal_vs, normal_fs, black_white_vs, black_white_fs,
                     fish_eye_vs, fish_eye_fs, ripple_vs, ripple_fs,
                     toon_vs, toon_fs, custom_vs, custom_fs])
        .then((shaders) => this.loadAllShaders(shaders))
        .catch((error) => this.getFileError(error));
    }

    loadAllShaders(shaders) {
        this.shader.normal = this.createShaderProgram(shaders[0], shaders[1]);
        this.shader.black_white = this.createShaderProgram(shaders[2], shaders[3]);
        this.shader.fish_eye = this.createShaderProgram(shaders[4], shaders[5]);
        this.shader.ripple = this.createShaderProgram(shaders[6], shaders[7]);
        this.shader.toon = this.createShaderProgram(shaders[8], shaders[9]);
        this.shader.custom = this.createShaderProgram(shaders[10], shaders[11]);

        this.initializeGlApp();
    }

    createShaderProgram(vert_source, frag_source) {
        // Compile shader program
        let program = glslCreateShaderProgram(this.gl, vert_source, frag_source);

        // Bind vertex input data locations
        this.gl.bindAttribLocation(program, this.vertex_position_attrib, 'vertex_position');
        this.gl.bindAttribLocation(program, this.vertex_texcoord_attrib, 'vertex_texcoord');

        // Link shader program
        glslLinkShaderProgram(this.gl, program);

        // Get list of uniforms available in shaders
        let uniforms = glslGetShaderProgramUniforms(this.gl, program);
        
        return {program: program, uniforms: uniforms};
    }

    initializeGlApp() {
        // set drawing area to be the entire framebuffer
        this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
        // set the background color to black
        this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        // enable z-buffer for visible surface determination
        this.gl.enable(this.gl.DEPTH_TEST);

        // create plane model
        this.plane = this.createPlaneVao();

        // initialize texture
        this.initializeTexture();

        // render scene
        window.requestAnimationFrame((timestamp) => { this.animate(timestamp) });
    }

    createPlaneVao() {
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
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);


        // store the number of vertices used for entire model (number of faces * 3)
        vertex_array.face_index_count = indices.length;


        // return created Vertex Array Object
        return vertex_array;
    }

    initializeTexture() {
        // create a texture, and upload a temporary 1px green RGBA array [0, 135, 0, 255]
        this.video_texture = this.gl.createTexture();

        this.gl.bindTexture(this.gl.TEXTURE_2D, this.video_texture);

        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

        let pixels = [0, 135, 0, 255];
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, new Uint8Array(pixels));

        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    }

    updateTexture() {
        // update texture from video
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.video_texture);

        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.video);

        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    }

    setFilter(filter) {
        this.filter = filter;
    }

    animate(timestamp) {
        let time = timestamp - this.start_time;

        if (this.has_video) {
            this.updateTexture();
        }
        this.render(time);

        window.requestAnimationFrame((timestamp) => { this.animate(timestamp) });
    }

    render(time) {
        // delete previous frame (reset both framebuffer and z-buffer)
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        
        // render plane with texture
        let shader = this.shader[this.filter];
        this.gl.useProgram(shader.program);

        this.gl.uniformMatrix4fv(shader.uniforms.projection_matrix, false, this.projection_matrix);
        this.gl.uniformMatrix4fv(shader.uniforms.view_matrix, false, this.view_matrix);
        this.gl.uniformMatrix4fv(shader.uniforms.model_matrix, false, this.model_matrix);

        if (this.filter === 'custom') {
            this.gl.uniform1f(shader.uniforms.width, this.video.videoWidth);
            this.gl.uniform1f(shader.uniforms.height, this.video.videoHeight);
        }
        else if (this.filter === 'ripple') {
            this.gl.uniform1f(shader.uniforms.time, time / 1000.0);
        }

        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.video_texture);
        this.gl.uniform1i(shader.uniforms.image, 0);


        this.gl.bindVertexArray(this.plane);
        this.gl.drawElements(this.gl.TRIANGLES, this.plane.face_index_count, this.gl.UNSIGNED_SHORT, 0);
        this.gl.bindVertexArray(null);

        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    }

    getFile(url) {
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

    getFileError(error) {
        console.log('Error:', error);
    }
}
