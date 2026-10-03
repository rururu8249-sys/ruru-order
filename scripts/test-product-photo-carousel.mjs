import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import Renderer, { act } from "react-test-renderer";
import { createUiLoader } from "./admin-ui-test-loader.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const componentPath = "components/order/ProductPhotoCarousel.tsx";
assert.equal(
  fs.existsSync(componentPath),
  true,
  "customer option sheet needs a reusable swipe photo carousel",
);

const ProductPhotoCarousel = createUiLoader()(componentPath).default;
const changes = [];
const opened = [];
const scrollCalls = [];
const scroller = {
  clientWidth: 320,
  scrollLeft: 0,
  scrollTo(options) {
    scrollCalls.push(options);
    this.scrollLeft = options.left;
  },
};

function CarouselHarness() {
  const [selectedPhoto, setSelectedPhoto] = React.useState("a.jpg");
  return React.createElement(ProductPhotoCarousel, {
    images: ["a.jpg", "b.jpg", "c.jpg"],
    selectedPhoto,
    alt: "구찌",
    onPhotoChange(photo) {
      changes.push(photo);
      setSelectedPhoto(photo);
    },
    onOpen: (photo) => opened.push(photo),
  });
}

let tree;
await act(async () => {
  tree = Renderer.create(
    React.createElement(CarouselHarness),
    {
      createNodeMock(element) {
        return element.props["data-photo-carousel-track"] ? scroller : {};
      },
    },
  );
});

const dots = tree.root.findAllByProps({ "data-photo-carousel-dot": true });
assert.equal(dots.length, 3, "one position dot should render for every product photo");
assert.equal(dots[0].props["aria-current"], "true", "the first photo dot should start active");
assert.equal(dots[1].props["aria-current"], undefined);

await act(async () => dots[1].props.onClick());
assert.equal(changes.at(-1), "b.jpg", "choosing a dot should select its photo");
assert.deepEqual(scrollCalls.at(-1), { left: 320, behavior: "smooth" });
assert.equal(tree.root.findAllByProps({ "data-photo-carousel-dot": true })[1].props["aria-current"], "true");

const track = tree.root.findByProps({ "data-photo-carousel-track": true });
await act(async () => track.props.onScroll({ currentTarget: { clientWidth: 320, scrollLeft: 640 } }));
assert.equal(changes.at(-1), "c.jpg", "native horizontal swiping should update the selected photo");
assert.equal(tree.root.findAllByProps({ "data-photo-carousel-dot": true })[2].props["aria-current"], "true");

const slides = tree.root.findAllByProps({ "data-photo-carousel-slide": true });
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 120)); });
await act(async () => slides[2].props.onClick());
assert.equal(opened.at(-1), "c.jpg", "tapping a photo should open that exact photo");

await act(async () => tree.unmount());

function ControlledCarousel() {
  const [selectedPhoto, setSelectedPhoto] = React.useState("a.jpg");
  return React.createElement(ProductPhotoCarousel, {
    images: ["a.jpg", "b.jpg", "c.jpg"],
    selectedPhoto,
    alt: "순서 유지",
    onPhotoChange: setSelectedPhoto,
    onOpen() {},
  });
}

await act(async () => {
  tree = Renderer.create(React.createElement(ControlledCarousel), {
    createNodeMock(element) {
      return element.props["data-photo-carousel-track"] ? scroller : {};
    },
  });
});
await act(async () => tree.root.findAllByProps({ "data-photo-carousel-dot": true })[1].props.onClick());
assert.deepEqual(
  tree.root.findAllByType("img").map((node) => node.props.src),
  ["a.jpg", "b.jpg", "c.jpg"],
  "selecting a photo must not reorder the swipe track",
);
await act(async () => tree.unmount());

await act(async () => {
  tree = Renderer.create(
    React.createElement(ProductPhotoCarousel, {
      images: ["only.jpg"],
      selectedPhoto: "only.jpg",
      alt: "단일 사진",
      onPhotoChange() {},
      onOpen() {},
    }),
  );
});
assert.equal(tree.root.findAllByProps({ "data-photo-carousel-dot": true }).length, 0, "a single photo should not waste space on position dots");
assert.equal(tree.root.findAllByProps({ "data-photo-carousel-nav": true }).length, 0, "a single photo should not render navigation controls");
await act(async () => tree.unmount());

console.log("PASS product photo carousel swipes smoothly and exposes compact position dots");
