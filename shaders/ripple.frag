#version 300 es

precision mediump float;

in vec2 texcoord;

uniform float time;
uniform sampler2D image;

out vec4 FragColor;

void main() {
    vec2 coord = texcoord * vec2(2, 2) - vec2(1, 1);
    float radius = length(coord);
    float off = (sin(radius * 30.0 - time * 5.0) + 0.5) / 60.0;
    vec2 offset = coord * vec2(off, off);
    coord = coord + offset;
    coord = (coord + vec2(1, 1)) / vec2(2, 2);
    FragColor = texture(image, coord);

}
