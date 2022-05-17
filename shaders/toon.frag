#version 300 es

precision mediump float;

in vec2 texcoord;

uniform sampler2D image;

out vec4 FragColor;

void main() {
    FragColor = texture(image, texcoord);
    FragColor[0] = round(FragColor[0] * 4.0) / 4.0; 
    FragColor[1] = round(FragColor[1] * 4.0) / 4.0; 
    FragColor[2] = round(FragColor[2] * 4.0) / 4.0; 

}
