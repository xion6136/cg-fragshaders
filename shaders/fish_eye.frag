#version 300 es

precision mediump float;

in vec2 texcoord;

uniform sampler2D image;

out vec4 FragColor;

void main() {
    vec2 coord = texcoord * vec2(2,2) - vec2(1,1);
    float theta = atan(texcoord[1], texcoord[0]);
    float radius = pow(length(texcoord), 1.5);
    vec2 fishcoord =  vec2(radius * cos(theta), radius * sin(theta));
    coord = (coord + vec2(1,1)) / vec2(2,2);
    coord = vec2(0.5) * (fishcoord + vec2(1,1));

    FragColor = texture(image, coord);
}
