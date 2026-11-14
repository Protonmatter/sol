// Backing-store coordinates shared by painting and pointer hit testing.
export function butterflyPlot(width,textScale){
  const left=38*textScale,right=14*textScale;
  return {left,width:width-left-right};
}
