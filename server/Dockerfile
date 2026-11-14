# Image produksi BranchSync API. Build dari folder server/:  docker build -t branchsync-api .
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/branchsync ./cmd/branchsync

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/branchsync /branchsync
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/branchsync"]
CMD ["serve"]
