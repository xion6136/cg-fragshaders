#version 300 es

precision mediump float;

in vec2 texcoord;

uniform sampler2D image;

out vec4 FragColor;

void main() {
    FragColor = texture(image, texcoord);
    float luminance = 0.299 * FragColor[0] + 0.587 * FragColor[1] + 0.114 * FragColor[2];
    FragColor[0] = luminance;
    FragColor[1] = luminance;
    FragColor[2] = luminance;
}
