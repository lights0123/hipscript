__global__ void kernel() {
    printf("Hello World!\n");
}

int main() {
    kernel<<<1, 1>>>();
}
