import bannerImg from "@/assets/banner.png";

export const HeroBanner = () => {
  return (
    <section className="w-full">
      <img
        src={bannerImg}
        alt="Still Informática - Next-Gen Gaming Power"
        className="w-full h-auto object-cover"
      />
    </section>
  );
};
